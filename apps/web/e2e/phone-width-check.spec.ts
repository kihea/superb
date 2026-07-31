// T5 -- ADR-032 clause 3: "the motion and micro-interaction work now in
// flight is judged on a phone viewport before its tokens are adopted, not
// after." Not a permanent regression test (no assertions beyond "it
// renders") -- a one-time capture run at 390px, screenshots pasted into
// the PR body per the track's own DONE list, before any of Job 1-4's
// tokens are treated as settled.
import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("phone width: the reading state with the gloss card and Keep control open", async ({ page }) => {
  await page.goto("/");
  await page.locator(".passage-page").waitFor({ timeout: 15_000 });
  await page.locator(".passage-word").first().click();
  await page.locator(".gloss-card").waitFor();
  await page.waitForTimeout(600); // let the card's own entrance settle before the capture
  await page.screenshot({ path: "test-results/phone-390-gloss-keep.png" });
});

test("phone width: Keep reading and the pixel break in flight", async ({ page }) => {
  await page.goto("/");
  await page.locator(".passage-page").waitFor({ timeout: 15_000 });
  // A genuine phone-width finding, not a copy of reading.spec.ts's own
  // wait: `.passage-continue-button` is position: fixed, so
  // scrollIntoViewIfNeeded on it is a no-op (it is always within the
  // viewport already) -- what actually reveals the sentinel that flips
  // `nearEnd` is scrolling the *document*. At the desktop widths the rest
  // of the suite runs at, the passage's own column is wide enough that the
  // whole thing (plus the sentinel) fits without any scroll, so the gap
  // this closes was invisible until this track tested at 390px. Filed as a
  // finding in the PR body -- not a fix to reading.spec.ts itself, which is
  // outside this track's ownership.
  await page.mouse.wheel(0, 4000);
  await expect(page.locator(".passage-continue")).toHaveClass(/passage-continue--visible/, { timeout: 15_000 });
  await page.locator(".passage-continue-button").click();
  await page.locator('[data-chrome-device="pixel-break"]').waitFor();
  await page.screenshot({ path: "test-results/phone-390-pixel-break.png" });
});
