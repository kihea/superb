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

// Renamed. ADR-036 Decision 5 is a promise about the *flourish*, not about
// the card carrying it: the gloss card measures x 320..960 against a passage
// text box of x 76..657 and sits over eight actual words, which is frame 3a's
// design rather than a defect. Anyone reading the old title as "nothing
// covers the passage" would have been wrong about what was checked.
test("the Keep flourish never occludes the passage text", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });

  await openGlossFor(page, 0);
  await page.locator(".gloss-keep-button").click();

  // Everything below happens in one round-trip, inside the page, because the
  // scatter only exists for about 550ms. The old form did a visibility
  // check and then two more sequential round-trips before reading its box;
  // on a loaded machine at three workers that could outlast the animation,
  // and `boundingBox()` then timed out on an element that had already
  // unmounted. That -- not an overlap -- is what failed in two of four full
  // runs. It was never `overlaps` coming back true: the passage column ends
  // at x=657 and the scatter begins at x=851, a 194px gutter that holds
  // across viewports, glossed words and font states.
  //
  // Waiting for the card to settle first, which is what I proposed and was
  // wrong to, would spend more of those 550ms before measuring and make the
  // timeout MORE likely -- and it would sample only after stillness, which
  // skips the entrance, the one window where an occlusion is arguable.
  //
  // So: sample every frame the flourish is alive for, and assert the
  // invariant on all of them. Frames are tagged with whether the card has
  // finished rising, so an entrance-time overlap can be told apart from a
  // stillness-time one -- a distinction no single sample can make, whenever
  // it is taken.
  const frames = await page.evaluate(async () => {
    const SELECTOR = '[data-chrome-device="pixel-scatter"]';
    const intersects = (a: DOMRect, b: DOMRect) =>
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

    const samples: {
      settled: boolean;
      overlapsText: boolean;
      /** Stricter than the box: actual word elements under the flourish. */
      wordsUnder: string[];
      /** Decision 5's own bound: the control that emitted it, not the card. */
      escapesControl: string[];
      /** The whole rationale below rests on this, so it is measured. */
      cardSurface: string;
    }[] = [];

    const deadline = performance.now() + 3000;
    for (;;) {
      const scatter = document.querySelector(SELECTOR);
      if (!scatter || performance.now() > deadline) break;

      const cells = scatter.getBoundingClientRect();
      const text = document.querySelector(".passage-text")!.getBoundingClientRect();
      const card = document.querySelector(".gloss-card");
      const settled = !card || !card.getAnimations().some((a) => a.playState === "running");

      // The control that emitted it. Bounding the flourish to the *card*
      // would be the looser of the two bounds Decision 5 names, and the one
      // it names in order to reject -- a scatter spread across the whole
      // 640px card would pass that and break the clause.
      const control = scatter.closest(".gloss-keep-button")?.getBoundingClientRect() ?? cells;
      const escapes: string[] = [];
      if (cells.left < control.left - 1) escapes.push(`left by ${Math.round(control.left - cells.left)}px`);
      if (cells.top < control.top - 1) escapes.push(`top by ${Math.round(control.top - cells.top)}px`);
      if (cells.right > control.right + 1) escapes.push(`right by ${Math.round(cells.right - control.right)}px`);
      if (cells.bottom > control.bottom + 1) {
        escapes.push(`bottom by ${Math.round(cells.bottom - control.bottom)}px`);
      }

      // Opaque, or the reasoning collapses: the card is what stands between
      // the flourish and any words beneath it. Recorded as a string so a
      // failure says what the surface actually was.
      const style = card ? getComputedStyle(card) : null;
      const alpha = Number(
        (style?.backgroundColor.match(/[\d.]+/g) ?? ["0", "0", "0", "0"])[3] ?? 1,
      );
      const opaque = Boolean(style) && alpha === 1 && style!.backdropFilter === "none";

      samples.push({
        settled,
        overlapsText: intersects(cells, text),
        wordsUnder: [...document.querySelectorAll(".passage-word")]
          .filter((word) => intersects(cells, word.getBoundingClientRect()))
          .map((word) => word.textContent ?? ""),
        escapesControl: escapes,
        cardSurface: opaque
          ? "opaque"
          : `${style?.backgroundColor ?? "no card"} / backdrop-filter: ${style?.backdropFilter ?? "-"}`,
      });

      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    }
    return samples;
  });

  // The flourish has to have been alive and watched, or this test proves
  // nothing at all.
  expect(frames.length, "the flourish was never sampled").toBeGreaterThan(5);

  const during = frames.filter((f) => !f.settled);
  const after = frames.filter((f) => f.settled);
  expect(during.filter((f) => f.overlapsText || f.wordsUnder.length > 0)).toEqual([]);
  expect(after.filter((f) => f.overlapsText || f.wordsUnder.length > 0)).toEqual([]);

  // Decision 5 verbatim: "extent bounded to the control that emitted it
  // rather than to the card". An earlier draft of this test bounded it to
  // the card -- the looser of the two, and the one the clause names in
  // order to reject -- while citing this clause as its authority. The
  // control's box is viewport-independent, which also retires the whole
  // question of what the geometry does at 390 versus 1280.
  expect(
    frames.filter((f) => f.escapesControl.length > 0),
    "the flourish reached past the control that emitted it",
  ).toEqual([]);

  // And the clause above only protects a reader while the card is solid.
  // If it ever regains the glass ADR-019 once specified, this goes red
  // rather than staying green over legible text.
  expect(
    [...new Set(frames.map((f) => f.cardSurface))],
    "the gloss card is not an opaque surface",
  ).toEqual(["opaque"]);
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
