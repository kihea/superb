// Proves the loop docs/seams.md names -- plan -> fetch -> decide -> save ->
// render -- actually runs end to end, against a real production build
// (playwright.config.ts builds and serves dist/, not the dev server), for
// both registers T4-surface.md asks to be judged side by side.
import { test, expect, type Page } from "@playwright/test";

const registers = ["glass", "paper"] as const;

async function currentPassageId(page: Page): Promise<string | null> {
  return page.locator(".passage-page").getAttribute("data-passage-id");
}

interface TopicTally {
  finished: number;
  abandoned: number;
}

/** Reads the mock engine's persisted state straight out of IndexedDB --
 *  not through the app's own code, so this cannot pass just because the
 *  app agrees with itself about what it wrote. */
async function readTopicTally(page: Page): Promise<[string, TopicTally] | null> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("superb-web", 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const raw = await new Promise<string | undefined>((resolve, reject) => {
      const tx = db.transaction("engine", "readonly");
      const req = tx.objectStore("engine").get("state");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { topicTally?: Record<string, { finished: number; abandoned: number }> };
    const entries = Object.entries(parsed.topicTally ?? {});
    return entries.length > 0 ? entries[0] : null;
  });
}

for (const register of registers) {
  test.describe(`register=${register}`, () => {
    test("renders a real passage from content/", async ({ page }) => {
      await page.goto(`/read?register=${register}`);
      await expect(page.locator(".passage-page")).toBeVisible();
      const words = page.locator(".passage-word");
      await expect(words.first()).toBeVisible();
      expect(await words.count()).toBeGreaterThan(20);
    });

    test("gloss tap arrives and dismisses", async ({ page }) => {
      await page.goto(`/read?register=${register}`);
      const firstWord = page.locator(".passage-word").first();
      await firstWord.click();

      const card = page.locator(".gloss-card");
      await expect(card).toBeVisible();
      await expect(card.locator(".gloss-definition")).not.toBeEmpty();
      await expect(card.locator(".gloss-elsewhere")).not.toBeEmpty();

      // The backdrop covers the whole viewport, including where the tapped
      // word visually sits -- so tapping there again lands on the backdrop,
      // not a second fire of the word's own handler, and dismisses just the
      // same (gloss-interaction.md: "tapping again dismisses it", no
      // confirmation, no cost).
      await card.locator("..").click({ position: { x: 5, y: 5 } });
      await expect(card).not.toBeVisible();
    });

    test("finish -> next passage -> reload resumes the new one", async ({ page }) => {
      await page.goto(`/read?register=${register}`);
      const before = await currentPassageId(page);

      await page.locator(".passage-continue-button").scrollIntoViewIfNeeded();
      await page.locator(".passage-continue-button").click();
      await expect(page.locator(".passage-page")).toBeVisible();

      const after = await currentPassageId(page);
      expect(after).not.toBe(before);

      // State persists to IndexedDB (docs/seams.md) -- a reload must resume
      // the passage just landed on, not start over or advance again.
      await page.reload();
      await expect(page.locator(".passage-page")).toBeVisible();
      const afterReload = await currentPassageId(page);
      expect(afterReload).toBe(after);
    });

    // ADR-022 / docs/seams.md's amendment: TopicAffinityUpdated crosses the
    // seam on every PassageFinished and must never reach the reader by any
    // route -- "no display, no 'you've been enjoying...', no topic chips,
    // no Settings readout, no debug overlay that survives to production."
    //
    // This checks the specific finished/abandoned values just written to
    // IndexedDB against three independent rendered surfaces: every
    // attribute on every element, the accessibility tree (ariaSnapshot --
    // page.accessibility.snapshot() was removed from Playwright; this is
    // the current replacement, and it can diverge from both DOM text and
    // DOM attributes, since an aria-label changes what a screen reader
    // announces without touching either), and exact-match text nodes for
    // the counts themselves.
    //
    // What this deliberately does NOT do: search for the topic id or label
    // itself (e.g. "harbour") anywhere on the page. A first version of this
    // test did, and it false-positived immediately -- the passage's own
    // prose legitimately contains its topic word ("...before it was lost
    // among the masts... the whole harbour seemed to hold its breath"), and
    // so does its id (comp-harbour-dawn), for reasons that have nothing to
    // do with a leak. The topic word is content; the tally is the secret.
    // Only the numbers, and the words "topic"/"affinity" as the feature's
    // own vocabulary, are things a passage would never legitimately say.
    test("topic affinity tally never reaches any rendered surface", async ({ page }) => {
      await page.goto(`/read?register=${register}`);
      await page.locator(".passage-continue-button").scrollIntoViewIfNeeded();
      await page.locator(".passage-continue-button").click();
      await expect(page.locator(".passage-page")).toBeVisible();

      const tally = await readTopicTally(page);
      expect(tally).not.toBeNull();
      const [, counts] = tally!;
      expect(counts.finished + counts.abandoned).toBeGreaterThan(0);

      // Route 1: rendered text content and the accessibility tree, for the
      // feature's own vocabulary -- words a real passage would not say.
      const bodyText = (await page.locator("body").innerText()).toLowerCase();
      expect(bodyText).not.toContain("topic");
      expect(bodyText).not.toContain("affinity");
      const ariaTree = (await page.locator("body").ariaSnapshot()).toLowerCase();
      expect(ariaTree).not.toContain("topic");
      expect(ariaTree).not.toContain("affinity");

      // Route 2: every attribute value on every element -- data-*,
      // aria-label, title -- for the exact counts, as whole attribute
      // values rather than substrings (a substring check on e.g. "1" would
      // false-positive on any unrelated id or index already on the page).
      const attributeLeak = await page.evaluate(
        ({ finished, abandoned }) => {
          const targets = new Set([String(finished), String(abandoned)]);
          for (const el of Array.from(document.querySelectorAll("*"))) {
            for (const attr of Array.from(el.attributes)) {
              if (targets.has(attr.value)) return `${el.tagName}[${attr.name}]="${attr.value}"`;
            }
          }
          return null;
        },
        counts,
      );
      expect(attributeLeak).toBeNull();

      // Route 3: the counts as exact standalone text nodes -- catches a
      // literal `{finished}` leak without false-positiving on an unrelated
      // number elsewhere on the same screen (a citation year, etc.).
      const numericLeak = await page.evaluate(
        ({ finished, abandoned }) => {
          const targets = new Set([String(finished), String(abandoned)]);
          for (const el of Array.from(document.querySelectorAll("*"))) {
            const ownText = Array.from(el.childNodes)
              .filter((n) => n.nodeType === Node.TEXT_NODE)
              .map((n) => n.textContent?.trim() ?? "")
              .join("");
            if (targets.has(ownText) && ownText !== "") return el.outerHTML.slice(0, 200);
          }
          return null;
        },
        counts,
      );
      expect(numericLeak).toBeNull();
    });
  });
}
