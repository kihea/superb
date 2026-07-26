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
  });
}
