// T5 Job 3 -- every device in components/chrome/ is chrome only (ADR-019
// as amended, ADR-028's amendment: while a passage is on screen the design
// persists as material and stops as event). Job 4's two ADR-036 exceptions
// (the Keep scatter and the passage-break flourish) are asserted
// separately in reading-state-flourish.spec.ts, because they are the
// deliberate exception rather than a containment check -- they are
// excluded from the sweep below *by name*, not by a wildcard, so a new,
// unrelated device cannot quietly ride along on the exclusion.
//
// Each of the five chrome-only devices, plus the two ADR-036 exceptions,
// carries a shared `data-chrome-device` attribute (see each component's
// own file) precisely so this test can make one sweep rather than seven
// bespoke selectors -- a new chrome device that forgets the attribute is
// invisible to this test, which is a real gap; the mitigation is that
// every file under components/chrome/ sets it, and a reviewer checking an
// eighth device against this file will notice the pattern.
//
// This check was watched red before being trusted, per workspace/tracks/
// _template.md: PassagePage.tsx was edited to mount <Loader /> beside
// <BreakChain />, on purpose, and both assertions failed as follows
// (verbatim, the edit reverted immediately after):
//
//   1) chrome-containment.spec.ts:22:1 > no chrome device is present
//      while a passage is on screen
//      Expected: 0
//      Received: 1
//   2) chrome-containment.spec.ts:30:1 > no chrome device is present in
//      the room around the passage either, while reading
//      Expected: 0
//      Received: 1
//
// The PR body carries the full run output; PassagePage.tsx's own diff is
// empty in this PR because the injection was never committed.
import { test, expect } from "@playwright/test";

const ADR_036_EXCEPTIONS = ["pixel-scatter", "pixel-break"];
const NOT_EXCEPTED = ADR_036_EXCEPTIONS.map((name) => `:not([data-chrome-device="${name}"])`).join("");
const LEAK_SELECTOR = `[data-chrome-device]${NOT_EXCEPTED}`;

test("no chrome device is present while a passage is on screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });

  const leaked = await page.locator(`.passage-page ${LEAK_SELECTOR}`).count();
  expect(leaked).toBe(0);
});

test("no chrome device is present in the room around the passage either, while reading", async ({ page }) => {
  // The stricter reading: ADR-028's amendment governs the whole reading
  // state, not only the text column -- the aura and margin mark sit in
  // `.reading-screen` alongside the card. Nothing in components/chrome/
  // besides the two named exceptions is wired into ReadingScreen at all,
  // so this is the fuller containment sweep, not a duplicate of the check
  // above.
  await page.goto("/");
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });

  const leaked = await page.locator(`.reading-screen ${LEAK_SELECTOR}`).count();
  expect(leaked).toBe(0);
});

// The DONE list asks for one assertion per Job 2 device, not only the
// combined sweep above -- named individually so a future device that sets
// the shared attribute wrong (say, misspells its own name) fails on its
// own line instead of vanishing into a passing combined count.
const JOB_2_DEVICES = ["loader", "orb", "quiet-button", "confirm-button", "sheen-switch", "screen-transition", "beam-card"];

for (const device of JOB_2_DEVICES) {
  test(`${device} is absent from the reading state`, async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });
    expect(await page.locator(`.reading-screen [data-chrome-device="${device}"]`).count()).toBe(0);
  });
}
