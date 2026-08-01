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
  // fallback, and not the composed-passage mock's fixture text, and not
  // merely "some nonempty text": the exact expected sense for a word this
  // pipeline has no homograph ambiguity about. ("May", tried first, has
  // exactly the ambiguity this assertion is meant to catch -- Wiktionary's
  // first-substantive-sense rule resolves it to the modal-verb sense, "to
  // have power (over)", which is real content but not a clean assertion
  // target. "Vampire" has one sense and it is the right one for this book.)
  const target = page.locator(".passage-word", { hasText: /^vampire$/ }).first();
  await target.scrollIntoViewIfNeeded();
  await target.click();
  const gloss = page.locator(".gloss-card");
  await expect(gloss).toBeVisible();
  await expect(gloss.locator(".gloss-word")).toHaveText("vampire");
  await expect(gloss.locator(".gloss-definition")).toHaveText(
    "A mythological creature (usually humanoid and undead) said to feed on the blood or life energy of the living.",
  );
  await gloss.locator("..").click({ position: { x: 5, y: 5 } });
  await expect(gloss).not.toBeVisible();

  // The tap reached the persisted encounter record.
  const afterTap = await readBookStore(page);
  expect(afterTap.encounters.some((e) => e.word === "vampire" && e.bookId === "bram-stoker_dracula")).toBe(
    true,
  );

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

  // Reload -- resumes at the same place, not the chapter's start. Checked
  // two ways on purpose: the stored index is necessary but not sufficient
  // (WholeBook.tsx's own scrollIntoView call, around line 95-104, is what
  // actually moves the reader there -- deleting that code would still leave
  // the correct index in IndexedDB and this test would not notice unless it
  // also asks where the page actually is).
  await page.reload();
  await expect(page.locator(".whole-book")).toHaveAttribute("data-part-index", "0", { timeout: 15_000 });
  await expect
    .poll(async () => (await readBookStore(page)).place?.blockIndex)
    .toBe(placeBeforeReload!.blockIndex);

  const resumedParagraph = page.locator(
    `.passage-text[data-block-index="${placeBeforeReload!.blockIndex}"]`,
  );
  await expect(resumedParagraph).toBeVisible();
  await expect
    .poll(async () => {
      const box = await resumedParagraph.boundingBox();
      return box ? Math.abs(box.y) : Number.POSITIVE_INFINITY;
    })
    .toBeLessThan(200);

  // The encounter survived the reload too, and the engine is still
  // untouched.
  const afterReload = await readBookStore(page);
  expect(afterReload.encounters.some((e) => e.word === "vampire")).toBe(true);
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

/** Seeds the book's saved place directly, the same way a real reader's
 *  earlier session would have left it -- reading/bookState.ts's own shape,
 *  written straight into IndexedDB rather than reached by scrolling, which
 *  is how the "last chapter" case below reaches chapter 28 without 27
 *  clicks. Requires a same-origin page already to be open (WholeBook.tsx's
 *  own load() reads this back the next time it mounts). */
async function seedPlace(page: Page, partIndex: number, blockIndex: number): Promise<void> {
  await page.evaluate(
    async ({ partIndex, blockIndex }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("superb-web");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("book", "readwrite");
        tx.objectStore("book").put(
          { bookId: "bram-stoker_dracula", partIndex, blockIndex, updatedAt: Date.now() },
          "place",
        );
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    { partIndex, blockIndex },
  );
}

test("the pull control crosses a chapter boundary, and the last chapter returns to Library", async ({
  page,
}) => {
  // The real chapter count, read from the same artifact the app serves --
  // not a number this test invents and could drift from. Needs a same-
  // origin document open first for `fetch` to resolve against; the book's
  // own page is as good a place as any, and this is where the test starts
  // anyway.
  await page.goto("/book/bram-stoker_dracula/read");
  const chapter = page.locator(".whole-book");
  const lastPartIndex = await page.evaluate(async () => {
    // A plain root-relative path, not import.meta.env.BASE_URL -- this
    // function is serialized and run as-is in the browser (Playwright's
    // page.evaluate, not a Vite-transformed module), and this suite's own
    // playwright.config.ts never sets VITE_BASE, so BASE_URL is "/" here
    // regardless.
    const res = await fetch("/content/catalogue-v0.1.0.json");
    const data = (await res.json()) as { books: { id: string; parts: unknown[] }[] };
    const book = data.books.find((b) => b.id === "bram-stoker_dracula")!;
    return book.parts.length - 1;
  });
  expect(lastPartIndex).toBeGreaterThan(1);

  // Chapter one -> chapter two, a real transition: the part index advances
  // and the text on screen actually changes.
  await expect(chapter).toHaveAttribute("data-part-index", "0", { timeout: 15_000 });
  const firstChapterOpening = await page.locator(".passage-text").first().innerText();

  await page.getByRole("button", { name: "Next chapter" }).click();
  await expect(chapter).toHaveAttribute("data-part-index", "1", { timeout: 15_000 });
  await expect(page.locator(".passage-text").first()).not.toHaveText(firstChapterOpening);

  // The last chapter's own "keep reading" -- reached by seeding place
  // rather than clicking through every chapter -- goes to Library, a real
  // screen, not the still-v0mock Shelf (WholeBook.tsx's own comment at
  // this branch).
  await seedPlace(page, lastPartIndex, 0);
  await page.reload();
  await expect(chapter).toHaveAttribute("data-part-index", String(lastPartIndex), { timeout: 15_000 });
  await page.getByRole("button", { name: "Next chapter" }).click();
  await expect(page).toHaveURL(/\/library$/);
});
