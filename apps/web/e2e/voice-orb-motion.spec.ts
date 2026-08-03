// The reading orb's motion register, as re-decided with the thinking-orbs
// states: while quiet the orb wears `searching`, held on one frame — a
// static mark that reads "the voice is here, at rest" — and it only moves
// while it is actually reading aloud (`working`), which is always
// reader-initiated. So stillness is unconditional now: with the motion
// switch on, with it off, and under prefers-reduced-motion, an idle orb
// paints exactly one frame. (The games' mic orbs run solving/composing —
// a different pair on a different surface, so the two jobs never wear the
// same face; that mapping is judged by eye, not asserted here.)
import { test, expect } from "@playwright/test";
import { openProse } from "./prose";

test("the idle orb is a single held frame when the motion switch is off", async ({ page }) => {
  // Runs before any of the app's own scripts, so this reproduces a reader
  // who set the switch last session and is now opening a fresh tab.
  await page.addInitScript(() => {
    window.localStorage.setItem("superb.motion", "off");
  });
  await openProse(page);
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });

  // The boot restore itself (I-1): the attribute must already read "off" by
  // the time the page has settled.
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");

  const orb = page.locator(".voice-orb-button canvas");
  await expect(orb).toBeVisible();

  const first = await orb.screenshot();
  await page.waitForTimeout(600);
  const second = await orb.screenshot();
  expect(second.equals(first), "the orb painted a different frame with the motion switch off").toBe(true);
});

test("the idle orb rests even when motion is allowed — it only moves while reading", async ({ page }) => {
  await openProse(page);
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });

  const orb = page.locator(".voice-orb-button canvas");
  await expect(orb).toBeVisible();

  // Idle: one frame, held, with no motion preference in the way at all.
  const beforeA = await orb.screenshot();
  await page.waitForTimeout(600);
  const beforeB = await orb.screenshot();
  expect(beforeB.equals(beforeA), "an idle orb turned without being asked to read").toBe(true);

  // And a live reduced-motion change cannot make stillness any stiller —
  // the frames stay identical rather than the orb re-mounting or flickering.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const afterA = await orb.screenshot();
  await page.waitForTimeout(600);
  const afterB = await orb.screenshot();
  expect(afterB.equals(afterA), "the orb moved after reduced-motion was requested live").toBe(true);
});
