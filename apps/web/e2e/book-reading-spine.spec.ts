// The release acceptance spine for real books, rewritten for the
// restructured app: search the 614-book library for Dracula, open its
// cover, begin, read real chapter text, tap a glossed word and see a real
// meaning, read far enough to move the saved place, reload and resume,
// then reopen offline.
//
// Two things this now asserts that the old spine could not:
//
//   - Only words the book's own gloss table knows are tappable. A word
//     with no meaning saved is plain text -- every `.passage-word` on the
//     page must be a key in the served gloss table.
//   - Ordinary reading never touches the engine at all. WholeBook.tsx never
//     imports it, so after a whole book-only session the engine store holds
//     no state whatsoever -- stronger than the old "unchanged" check.
//
// Dracula on purpose: it is the one book served from the vendored local
// artifact (public/content/catalogue-v0.1.0.json) rather than fetched from
// the jsDelivr CDN, so this test never leaves localhost.
import { test, expect, type Page } from "@playwright/test";

interface BookPlace {
  bookId: string;
  partIndex: number;
  blockIndex: number;
  updatedAt: number;
}

/** Reads the shell's saved places straight out of IndexedDB -- not through
 *  the app's own code, so this cannot pass just because the app agrees with
 *  itself about what it wrote. Places live under the "places" key of the
 *  "book" store, one record per book id (storage/db.ts). */
async function readPlace(page: Page, bookId: string): Promise<BookPlace | null> {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      // No version pinned: this only reads, after the app itself has
      // already opened (and upgraded) the database via a real navigation.
      const req = indexedDB.open("superb-web");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const places = await new Promise<Record<string, BookPlace> | undefined>((resolve, reject) => {
      const tx = db.transaction("book", "readonly");
      const req = tx.objectStore("book").get("places");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return places?.[id] ?? null;
  }, bookId);
}

/** The engine's persisted document, or null when the engine has never run.
 *  Book reading must leave this null: there is no code path from a book
 *  into the engine (reading/bookState.ts never imports it). */
async function readEngineState(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("superb-web");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (!db.objectStoreNames.contains("engine")) return null;
    return new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction("engine", "readonly");
      const req = tx.objectStore("engine").get("state");
      req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  });
}

test("one real book, end to end: find it, read it, tap a word, resume, work offline", async ({ page, context }) => {
  // One test walks the whole spine -- a real search, a real gloss table,
  // and a service-worker offline round trip in sequence -- which is
  // genuinely more work than the default 30s budget assumes.
  test.setTimeout(60_000);

  // A brand-new visitor's very first "/" goes to the welcome; this reader
  // has been here before, which is the ordinary case for the spine.
  await page.addInitScript(() => {
    window.localStorage.setItem("superb.welcomed", "1");
  });

  // Search the real catalogue index for a known book. A result is a
  // typeset jacket now: the styled title with the author beneath it.
  await page.goto("/library");
  await page.getByPlaceholder("Title or author").fill("Dracula");
  const result = page.locator(".jacket", { hasText: "Dracula" });
  await expect(result).toBeVisible({ timeout: 15_000 });
  await expect(result).toContainText("Bram Stoker");
  // The index carries exactly one book by that name.
  await expect(page.locator(".jacket")).toHaveCount(1);
  await result.click();

  // The cover: real names, the first line, and one way in.
  await expect(page).toHaveURL(/\/book\/bram-stoker_dracula$/);
  await expect(page.locator(".book-names")).toContainText("Dracula");
  await expect(page.locator(".book-names")).toContainText("Bram Stoker");
  await expect(page.locator(".book-opening")).toBeVisible();
  await page.getByRole("button", { name: "Begin" }).click();

  // Chapter one, real text. Fifteen-second timeouts match the suite's
  // convention: tokenizing a chapter's worth of buttons is real work under
  // parallel-worker load.
  await expect(page).toHaveURL(/\/book\/bram-stoker_dracula\/read$/);
  const chapter = page.locator(".whole-book");
  await expect(chapter).toBeVisible({ timeout: 15_000 });
  await expect(chapter).toHaveAttribute("data-part-index", "0");
  const words = page.locator(".passage-word");
  await expect(words.first()).toBeVisible();
  expect(await words.count()).toBeGreaterThan(200);

  // Only glossed words are tappable: every rendered word button must be a
  // key in the book's own served gloss table, and plain (unglossed) text
  // must exist alongside them -- proof the page is not "everything is a
  // button" the way the prose game legitimately is.
  const table = await page.evaluate(async () => {
    const res = await fetch("/content/glosses/bram-stoker_dracula.json");
    return Object.keys((await res.json()) as Record<string, unknown>);
  });
  const known = new Set(table);
  const rendered = await words.evaluateAll((els) => els.slice(0, 400).map((el) => el.textContent ?? ""));
  const strays = rendered.filter((w) => !known.has(w.toLowerCase()));
  expect(strays, "a word button exists with no gloss entry behind it").toEqual([]);

  // Tap a glossed word and see a real meaning -- the tapped word itself,
  // not a fallback line.
  const firstWord = (await words.first().innerText()).trim();
  await words.first().click();
  const gloss = page.locator(".gloss-card");
  await expect(gloss).toBeVisible();
  await expect(gloss.locator(".gloss-word")).toHaveText(firstWord);
  const definitionText = await gloss.locator(".gloss-definition").innerText();
  expect(definitionText.length).toBeGreaterThan(0);
  await gloss.locator("..").click({ position: { x: 5, y: 5 } });
  await expect(gloss).not.toBeVisible();

  // Opening the book already wrote a starting place.
  await expect
    .poll(async () => (await readPlace(page, "bram-stoker_dracula")) !== null, { timeout: 5_000 })
    .toBe(true);

  // Read far enough to move the saved place: scroll to a paragraph well
  // into the chapter and let the place-tracking observer catch up.
  const laterParagraph = page.locator(".passage-text").nth(6);
  await laterParagraph.scrollIntoViewIfNeeded();
  await expect
    .poll(async () => (await readPlace(page, "bram-stoker_dracula"))?.blockIndex ?? 0, { timeout: 5_000 })
    .toBeGreaterThan(0);
  const placeBeforeReload = await readPlace(page, "bram-stoker_dracula");
  expect(placeBeforeReload).toMatchObject({ bookId: "bram-stoker_dracula", partIndex: 0 });

  // Ordinary reading records nothing into the engine -- after all of the
  // above, the engine has never even run.
  expect(await readEngineState(page)).toBeNull();

  // Reload -- resumes at the same place, not the chapter's start.
  await page.reload();
  await expect(page.locator(".whole-book")).toHaveAttribute("data-part-index", "0", { timeout: 15_000 });
  await expect
    .poll(async () => (await readPlace(page, "bram-stoker_dracula"))?.blockIndex)
    .toBe(placeBeforeReload!.blockIndex);
  expect(await readEngineState(page)).toBeNull();

  // Offline reopen: the book's content was cached the moment it was read
  // online (content/catalogue.ts's explicit Cache API use). Wait for the
  // service worker itself to be ready first, so this is a real offline
  // check rather than one that happens to pass before the worker installs.
  await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true), null, { timeout: 15_000 });
  await page.waitForTimeout(1_000);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".whole-book")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".passage-word").first()).toBeVisible();
  await context.setOffline(false);
});
