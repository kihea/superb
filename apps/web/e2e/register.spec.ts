// The register decision, receipted 2026-07-27 (workspace/decisions/
// README.md, private root): Kihea chose "a little of his own hand" from
// three built candidates -- item 7 is discharged, and that choice is now
// the only screen that exists. These checks (originally written across
// all three candidates while the choice was still open) now guard the one
// that shipped: the margin mark, the passage-break chain with its dropped
// tooth, and the hand-drawn nav icon on the pull-up button.
import { test, expect } from "@playwright/test";

test("renders the real passage, decorative motifs never become tap targets", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });

  // Every word is still the same identical button -- no drawn motif is
  // allowed to reach into the passage text itself.
  const words = page.locator(".passage-word");
  expect(await words.count()).toBeGreaterThan(20);
  const classNames = await words.evaluateAll((els) => [...new Set(els.map((el) => el.className))]);
  expect(classNames).toEqual(["passage-word"]);

  // The doodle motifs are marked aria-hidden and are not focusable or
  // clickable -- a drawn register must not add a fourth interaction to a
  // screen law 3 says has exactly one kind of target. And -- the
  // containment half, not just the interaction half -- none of them is
  // ever inside .passage-text: a mark's *position* connecting to a
  // particular word is exactly what law 3 forbids, independent of whether
  // the mark is itself tappable. A verifier mutation test caught this gap
  // for BreakChain specifically (moved it inside .passage-text, all tests
  // still passed) -- DoodleArrow already had this assertion on its own
  // (below); MarginMark and BreakChain did not, until now.
  for (const selector of [".margin-mark", ".break-chain", ".doodle-arrow"]) {
    const nodes = page.locator(selector);
    await expect(nodes.first()).toHaveAttribute("aria-hidden", "true");
    const tabIndex = await nodes.first().evaluate((el) => el.getAttribute("tabindex"));
    expect(tabIndex).toBeNull();
    expect(await page.locator(`.passage-text ${selector}`).count()).toBe(0);
  }
});

// The dropped tooth is chosen once and fixed, not randomised per render
// (DERIVATION-001) -- two independent loads must draw the identical number
// of chain links.
test("the break chain's dropped tooth is stable across reloads, not randomised", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });
  const first = await page.locator(".break-chain-link").count();
  expect(first).toBeGreaterThan(0);

  await page.reload();
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });
  const second = await page.locator(".break-chain-link").count();

  expect(first).toBe(second);
});

// The nav-icon boundary from Kihea's own direction (2026-07-27): a drawn
// icon may decorate an existing chrome action, but it must never sit
// inside the text column or become a second interactive target of its
// own -- the same law-3 line the passage-break chain's placement already
// has to hold.
test("the doodle nav icon decorates the pull-up button, never the passage text", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });

  expect(await page.locator(".passage-text .doodle-arrow").count()).toBe(0);

  const icon = page.locator(".passage-continue-button .doodle-arrow");
  await expect(icon).toHaveCount(1);
  await expect(icon).toHaveAttribute("aria-hidden", "true");
  const tabIndex = await icon.evaluate((el) => el.getAttribute("tabindex"));
  expect(tabIndex).toBeNull();
});

// The general law-3 sweep, reused from reading.spec.ts's own topic-
// affinity check: the drawn register must not be the thing that quietly
// leaks the schedule.
test("the drawn register does not narrate its own pedagogy in rendered text", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });
  const bodyText = (await page.locator("body").innerText()).toLowerCase();
  for (const word of ["topic", "affinity", "streak", "score", "level", "review queue"]) {
    expect(bodyText).not.toContain(word);
  }
});

// The seam audit (ADVISORY-008 §5 item 4): none of the three drawn motifs
// may itself be an animation running behind the text, in either colour
// scheme. Printed still, per DERIVATION-001's own shape rule.
for (const scheme of ["dark", "light"] as const) {
  test(`the doodle motifs are printed still, not animating: ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);

    for (const selector of [".margin-mark-stroke", ".break-chain-link", ".doodle-arrow-stroke"]) {
      const animationName = await page
        .locator(selector)
        .first()
        .evaluate((el) => getComputedStyle(el).animationName);
      expect(animationName).toBe("none");
    }
  });
}
