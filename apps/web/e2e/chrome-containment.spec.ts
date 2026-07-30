// T5 Job 3 -- every device in components/chrome/ is chrome only (ADR-019
// as amended, ADR-028's amendment: while a passage is on screen the design
// persists as material and stops as event). Job 4's two ADR-036 exceptions
// (the Keep scatter and the passage-break flourish) are asserted
// separately in reading-state-flourish.spec.ts, because they are the
// deliberate exception rather than a containment check.
//
// Each of the five devices carries a shared `data-chrome-device` attribute
// (see each component's own file) precisely so this test can make one
// sweep rather than five bespoke selectors -- a new chrome device that
// forgets the attribute is invisible to this test, which is a real gap;
// the mitigation is that every file under components/chrome/ sets it, and
// a reviewer checking a sixth device against this file will notice the
// pattern.
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

test("no chrome device is present while a passage is on screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });

  const leaked = await page.locator(".passage-page [data-chrome-device]").count();
  expect(leaked).toBe(0);
});

test("no chrome device is present in the room around the passage either, while reading", async ({ page }) => {
  // The stricter reading: ADR-028's amendment governs the whole reading
  // state, not only the text column -- the aura and margin mark sit in
  // `.reading-screen` alongside the card. Nothing in components/chrome/ is
  // wired into ReadingScreen today (this track only reaches the room via
  // Job 4's two named exceptions, asserted elsewhere), so this is the
  // fuller containment sweep, not a duplicate of the check above.
  await page.goto("/");
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });

  const leaked = await page.locator(".reading-screen [data-chrome-device]").count();
  expect(leaked).toBe(0);
});
