// The release acceptance spine (PLAN.md §6), for Slice 1A's one real book:
// clear state -> real first-run path -> search Dracula -> open chapter one
// -> tap a word, see a real gloss -> read far enough to record an encounter
// -> reload -> resumed at place -> the encounter is recorded while theta,
// its error, and the due list are untouched -> offline reopen works.
//
// Runs against a real production build (playwright.config.ts builds and
// serves dist/), through the same import path a reader uses -- no
// `v0mock`, no test-only fixture data. Each Playwright test already gets a
// fresh browser context (no cookies, no storage), which is this suite's
// existing way of satisfying "clear browser state" -- reading.spec.ts and
// walkable-v0.spec.ts both rely on the same isolation rather than clearing
// storage by hand.
import { test, expect, type Page } from "@playwright/test";

interface BookPlace {
  bookId: string;
  partIndex: number;
  blockIndex: number;
}

interface BookEncounter {
  bookId: string;
  word: string;
  partIndex: number;
  blockIndex: number;
}

/** Reads the shell's own book-reading store straight out of IndexedDB --
 *  not through the app's own code, the same discipline reading.spec.ts's
 *  `readTopicTally` already applies to the engine's state, and for the same
 *  reason: this must not pass just because the app agrees with itself about
 *  what it wrote. `db.ts`'s BOOK_STORE holds two keys, "place" and
 *  "encounters" -- see storage/db.ts and reading/bookState.ts. */
async function readBookStore(page: Page): Promise<{ place: BookPlace | null; encounters: BookEncounter[] }> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      // No version pinned -- see reading.spec.ts's readTopicTally for why:
      // this only ever reads, after the app itself has already opened (and
      // upgraded) the database via a real navigation earlier in the test.
      const req = indexedDB.open("superb-web");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const read = (key: string) =>
      new Promise<unknown>((resolve, reject) => {
        const tx = db.transaction("book", "readonly");
        const req = tx.objectStore("book").get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
    return {
      place: (await read("place")) as BookPlace | null,
      encounters: ((await read("encounters")) as BookEncounter[] | null) ?? [],
    };
  });
}

/** The engine's own persisted document -- read the same way
 *  reading.spec.ts's `readTopicTally` does, so "unchanged" is checked
 *  against the real serialized `LearnerState` rather than anything this
 *  test assumes about its shape. */
async function readEngineState(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      // No version pinned -- see reading.spec.ts's readTopicTally for why:
      // this only ever reads, after the app itself has already opened (and
      // upgraded) the database via a real navigation earlier in the test.
      const req = indexedDB.open("superb-web");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction("engine", "readonly");
      const req = tx.objectStore("engine").get("state");
      req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  });
}

test("one real book, end to end: find it, read it, tap a word, resume, work offline", async ({ page, context }) => {
  // This walks the whole spine in one test rather than ten small ones (a
  // real book, a real gloss table, and a service-worker offline round trip
  // all in sequence) -- genuinely more work than the default 30s budget
  // assumes, and Playwright's own default timeout is a per-test convention
  // this repo's other tests match by doing less per test, not a hard
  // product constraint (PLAN.md §6 gives the whole release gate twenty
  // minutes, not each of its steps thirty seconds).
  test.setTimeout(60_000);

  // Real first-run path: the app opens on the reading state, exactly as a
  // stranger arriving at the deployed URL would see it (App.tsx: "`/` is
  // still the reading state").
  await page.goto("/");
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });
  const engineStateAfterFirstOpen = await readEngineState(page);
  expect(engineStateAfterFirstOpen).not.toBeNull();

  // Search for a known real book, from the real catalogue artifact.
  await page.goto("/library");
  await page.getByPlaceholder("Title or author").fill("Dracula");
  const result = page.locator(".library-book", { hasText: "Dracula" });
  await expect(result).toBeVisible();
  await expect(result).toContainText("Bram Stoker");
  // No v0mock title sits alongside it -- the artifact carries one book.
  await expect(page.locator(".library-book")).toHaveCount(1);
  await result.click();

  await expect(page).toHaveURL(/\/book\/bram-stoker_dracula$/);
  await expect(page.locator(".book-names")).toContainText("Dracula");
  // Real provenance, not invented jacket copy.
  await expect(page.locator("body")).toContainText("Standard Ebooks");
  await page.getByRole("button", { name: "Begin" }).click();

  // Chapter one, real text tokenized into tappable words. Fifteen-second
  // timeouts here match reading.spec.ts's own convention: tokenizing a
  // whole chapter's worth of buttons is real work, and headless Chromium
  // under heavy parallel-worker load can starve a render for seconds --
  // an infrastructure timing variance, not a logic bug (see that file's
  // own comment).
  await expect(page).toHaveURL(/\/book\/bram-stoker_dracula\/read$/);
  const chapter = page.locator(".whole-book");
  await expect(chapter).toBeVisible({ timeout: 15_000 });
  await expect(chapter).toHaveAttribute("data-part-index", "0");
  const words = page.locator(".passage-word");
  await expect(words.first()).toBeVisible();
  expect(await words.count()).toBeGreaterThan(1000);

  const engineStateBeforeReading = await readEngineState(page);

  // Tap a known word and see a real gloss -- not the honest "no entry yet"
  // fallback, and not the composed-passage mock's fixture text.
  await words.first().click();
  const gloss = page.locator(".gloss-card");
  await expect(gloss).toBeVisible();
  await expect(gloss.locator(".gloss-word")).toHaveText("May");
  const definitionText = await gloss.locator(".gloss-definition").innerText();
  expect(definitionText.length).toBeGreaterThan(0);
  expect(definitionText).not.toContain("doesn't have a meaning saved yet");
  expect(definitionText).not.toContain("not curated for this build");
  await gloss.locator("..").click({ position: { x: 5, y: 5 } });
  await expect(gloss).not.toBeVisible();

  // The tap reached the persisted encounter record.
  const afterTap = await readBookStore(page);
  expect(afterTap.encounters.some((e) => e.word === "May" && e.bookId === "bram-stoker_dracula")).toBe(true);

  // Read far enough to move the saved place: scroll to a paragraph well
  // into the chapter and let the place-tracking observer catch up.
  const laterParagraph = page.locator(".passage-text").nth(6);
  await laterParagraph.scrollIntoViewIfNeeded();
  await expect
    .poll(async () => (await readBookStore(page)).place?.blockIndex ?? 0, { timeout: 5_000 })
    .toBeGreaterThan(0);
  const placeBeforeReload = (await readBookStore(page)).place;
  expect(placeBeforeReload).toMatchObject({ bookId: "bram-stoker_dracula", partIndex: 0 });

  // Neither the tap nor the scroll touched the engine's own state --
  // ADR-031: a book encounter is recorded and consumes nothing.
  const engineStateAfterReading = await readEngineState(page);
  expect(engineStateAfterReading).toBe(engineStateBeforeReading);

  // Reload -- resumes at the same place, not the chapter's start.
  await page.reload();
  await expect(page.locator(".whole-book")).toHaveAttribute("data-part-index", "0", { timeout: 15_000 });
  await expect
    .poll(async () => (await readBookStore(page)).place?.blockIndex)
    .toBe(placeBeforeReload!.blockIndex);
  // The encounter survived the reload too, and the engine is still
  // untouched.
  const afterReload = await readBookStore(page);
  expect(afterReload.encounters.some((e) => e.word === "May")).toBe(true);
  expect(await readEngineState(page)).toBe(engineStateBeforeReading);

  // Offline reopen: the book's own content was cached the moment it was
  // read online (content/catalogue.ts, content/glosses.ts's own explicit
  // Cache API use -- the same pattern content/store.ts already relies on,
  // scripts/check-offline.mjs's own comment on why this does not depend on
  // service-worker timing). Wait for the service worker itself to be ready
  // first, the same way check-offline.mjs does, so this is a real offline
  // check rather than one that happens to pass before the worker installs.
  await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true), null, { timeout: 15_000 });
  await page.waitForTimeout(1_000);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".whole-book")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".passage-word").first()).toBeVisible();
  await context.setOffline(false);
});
