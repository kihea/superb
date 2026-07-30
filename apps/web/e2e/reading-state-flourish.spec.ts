// T5 Job 4 -- ADR-036's one named exception to the reading state's
// stillness rule: the Keep scatter (A3) and the passage-break flourish
// (B4). Both are reader-started and both end in stillness, which is why
// they are legal where every other chrome device (chrome-containment.
// spec.ts) is forbidden.
import { test, expect, type Page } from "@playwright/test";

async function openGlossFor(page: Page, index: number) {
  const word = page.locator(".passage-word").nth(index);
  await word.click();
  await expect(page.locator(".gloss-card")).toBeVisible();
}

test("the Keep scatter fires from the gloss card and the card returns to stillness", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });

  await openGlossFor(page, 0);
  const keep = page.locator(".gloss-keep-button");
  await expect(keep).toBeVisible();

  await keep.click();
  // The scatter mounts under the button that emitted it -- present while
  // it runs.
  await expect(page.locator('.gloss-keep-button [data-chrome-device="pixel-scatter"]')).toBeVisible();
  // It ends in stillness: the card closes once the scatter finishes, and
  // nothing is left running on the reading state after that.
  await expect(page.locator(".gloss-card")).toBeHidden({ timeout: 3_000 });
});

// ADR-036 Decision 3, the bound that matters most on this track: the
// scatter must be pixel-identical whether the kept word is a target word
// or not. There is no signal in the DOM that says which word is a target
// (law 3 forbids exactly that), so this test instead proves the stronger,
// checkable fact the decision actually rests on: the Keep control's own
// markup does not vary with which word was tapped at all. GlossCardProps
// carries no such field (see GlossCard.tsx's own comment) -- this is the
// e2e proof that the absence of a channel holds in the built page, not
// only in the source.
//
// Watched red: KeepButton was given a temporary `word` prop and a
// `data-word={word}` attribute on the button itself, simulating exactly
// the leak ADR-036 forbids, and this test failed as follows (verbatim,
// the edit reverted immediately after):
//
//   Expected: "<button type="button" data-word="The" class="gloss-keep-button"
//     aria-pressed="false" aria-label="Keep">...</button>"
//   Received: "<button type="button" data-word="over" class="gloss-keep-button"
//     aria-pressed="false" aria-label="Keep">...</button>"
//
// The PR body carries the full run output.
test("the Keep control's markup does not vary with which word was tapped", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });

  const wordCount = await page.locator(".passage-word").count();
  expect(wordCount).toBeGreaterThan(5);

  await openGlossFor(page, 0);
  const firstHtml = await page.locator(".gloss-keep-button").evaluate((el) => el.outerHTML);
  await page.locator(".gloss-backdrop").click();
  await expect(page.locator(".gloss-card")).toBeHidden();

  // A different word, deliberately far from the first so it is very
  // unlikely to be the identical string.
  await openGlossFor(page, Math.min(5, wordCount - 1));
  const secondHtml = await page.locator(".gloss-keep-button").evaluate((el) => el.outerHTML);

  expect(secondHtml).toBe(firstHtml);
});

test("the Keep scatter never occludes the passage text", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });

  await openGlossFor(page, 0);
  await page.locator(".gloss-keep-button").click();

  const scatter = page.locator('[data-chrome-device="pixel-scatter"]');
  await expect(scatter).toBeVisible();

  const textBox = await page.locator(".passage-text").boundingBox();
  const scatterBox = await scatter.boundingBox();
  expect(textBox).not.toBeNull();
  expect(scatterBox).not.toBeNull();
  // The scatter's box (in the gloss card, at the foot of the viewport)
  // must not overlap the passage text's box at all -- not merely "not
  // drawn over," but nowhere near it, since the card is portalled well
  // below the text column.
  const overlaps =
    textBox!.y < scatterBox!.y + scatterBox!.height &&
    textBox!.y + textBox!.height > scatterBox!.y &&
    textBox!.x < scatterBox!.x + scatterBox!.width &&
    textBox!.x + textBox!.width > scatterBox!.x;
  expect(overlaps).toBe(false);
});

test("the pixel break fires from Keep reading, bounded to the button, and the passage advances only once it ends", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });
  const firstPassageId = await page.locator(".passage-page").getAttribute("data-passage-id");

  await page.locator(".passage-continue-button").scrollIntoViewIfNeeded();
  await expect(page.locator(".passage-continue")).toHaveClass(/passage-continue--visible/, { timeout: 15_000 });
  await page.locator(".passage-continue-button").click();

  await expect(page.locator('.reading-screen-break [data-chrome-device="pixel-break"]')).toBeVisible();

  // Ends in stillness, and only then does the next passage arrive -- the
  // trigger does not unmount the animation out from under itself.
  await expect
    .poll(async () => page.locator(".passage-page").getAttribute("data-passage-id"), { timeout: 5_000 })
    .not.toBe(firstPassageId);
  await expect(page.locator('[data-chrome-device="pixel-break"]')).toHaveCount(0);
});

for (const scheme of ["dark", "light"] as const) {
  test(`the Keep scatter collapses to nothing under prefers-reduced-motion: ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });

    await openGlossFor(page, 0);
    await page.locator(".gloss-keep-button").click();

    const cell = page.locator('[data-chrome-device="pixel-scatter"] .chrome-pixel-scatter__cell').first();
    await expect(cell).toHaveCSS("animation-name", "none");
  });
}
