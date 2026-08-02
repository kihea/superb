// Phone width, two jobs. The captures are T5's original job (ADR-032
// clause 3: motion work is judged on a phone viewport, screenshots into
// the PR body). The overflow sweep below them is a permanent assertion:
// no room in the restructured app may scroll sideways at 390px.
import { test, expect } from "@playwright/test";
import { openProse } from "./prose";
import { ROUTES } from "../src/routes";

test.use({ viewport: { width: 390, height: 844 } });

test("phone width: the reading state with the gloss card and Keep control open", async ({ page }) => {
  await openProse(page);
  await page.locator(".passage-page").waitFor({ timeout: 15_000 });
  await page.locator(".passage-word").first().click();
  await page.locator(".gloss-card").waitFor();
  await page.waitForTimeout(600); // let the card's own entrance settle before the capture
  await page.screenshot({ path: "test-results/phone-390-gloss-keep.png" });
});

test("phone width: Keep reading and the pixel break in flight", async ({ page }) => {
  await openProse(page);
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

// Every screen in routes.ts, at phone width, may scroll down but never
// sideways. This walks the app's own route list rather than a copy of it,
// so a screen added without a row there fails the smoke walk before it can
// dodge this one.
test("phone width: no room scrolls sideways", async ({ page }) => {
  test.setTimeout(60_000);
  // This reader has been welcomed before -- the redirect is not what is
  // being measured here (v1-walk.spec.ts covers it).
  await page.addInitScript(() => {
    window.localStorage.setItem("superb.welcomed", "1");
  });

  for (const route of ROUTES) {
    const path = route.example ?? route.path;
    await page.goto(path);
    // Let each room fetch and lay out what it needs before measuring --
    // an empty room passes trivially, so the measurement must come after
    // the content does.
    await page.waitForLoadState("load");
    await page.waitForTimeout(700);
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const width = window.innerWidth;
            return Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - width;
          }),
        { message: `"${route.name}" (${path}) overflows sideways at 390px`, timeout: 15_000 },
      )
      .toBeLessThanOrEqual(1);
  }
});
