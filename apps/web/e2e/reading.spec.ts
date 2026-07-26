// Proves the loop docs/seams.md names -- plan -> fetch -> decide -> save ->
// render -- actually runs end to end, against a real production build
// (playwright.config.ts builds and serves dist/, not the dev server), for
// both registers T4-surface.md asks to be judged side by side.
import { test, expect, type Page } from "@playwright/test";

const registers = ["glass", "paper"] as const;

async function currentPassageId(page: Page): Promise<string | null> {
  return page.locator(".passage-page").getAttribute("data-passage-id");
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
    // seam on every PassageFinished and must never reach the reader --
    // "no display, no 'you've been enjoying...', no topic chips, no
    // Settings readout, no debug overlay that survives to production." This
    // asserts both halves: the plumbing actually ran (the tally is really
    // in the persisted, opaque engine state) and nothing about it is on
    // screen anywhere.
    test("topic affinity updates land in persisted state, never on screen", async ({ page }) => {
      await page.goto(`/read?register=${register}`);
      await page.locator(".passage-continue-button").scrollIntoViewIfNeeded();
      await page.locator(".passage-continue-button").click();
      await expect(page.locator(".passage-page")).toBeVisible();

      const bodyText = await page.locator("body").innerText();
      expect(bodyText.toLowerCase()).not.toContain("topic");
      expect(bodyText.toLowerCase()).not.toContain("affinity");

      const stateHasTally = await page.evaluate(async () => {
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
        if (!raw) return false;
        const parsed = JSON.parse(raw) as { topicTally?: Record<string, unknown> };
        return Object.keys(parsed.topicTally ?? {}).length > 0;
      });
      expect(stateHasTally).toBe(true);
    });
  });
}
