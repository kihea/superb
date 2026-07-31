// PR-104 review (B-1): nothing before this asserted the orb actually stops
// turning when the motion switch is off -- only that `prefers-reduced-motion`
// freezes it (VoiceOrb's own header) and that it does not disturb the
// reading-state seam while `still` and the switch is on. This closes that
// gap directly, and does it through the real stored preference (I-1's fix)
// rather than by flipping the switch mid-session -- a fresh tab, straight to
// "/", with "off" already in storage, which is exactly the scenario I-1
// broke and this now stands as the regression guard for.
import { test, expect } from "@playwright/test";

test("the voice orb is frozen when the motion switch is off, from the very first frame", async ({ page }) => {
  // Runs before any of the app's own scripts, so this reproduces a reader
  // who set the switch last session and is now opening a fresh tab -- not a
  // toggle made after the orb has already mounted and started spinning.
  await page.addInitScript(() => {
    window.localStorage.setItem("superb.motion", "off");
  });
  await page.goto("/");
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });

  // The boot restore itself (I-1): the attribute must already read "off" by
  // the time the page has settled, not merely once Settings happens to be
  // visited.
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");

  const orb = page.locator(".voice-orb-button .voice-orb");
  await expect(orb).toBeVisible();

  // Two photographs of the canvas itself, a beat apart -- if the orb is
  // still turning, this is the same kind of byte-for-byte check reading.
  // spec.ts's seam audit uses for the aura, applied to the one thing on this
  // screen that is allowed to move when the switch says it may.
  const first = await orb.screenshot();
  await page.waitForTimeout(600);
  const second = await orb.screenshot();
  expect(second.equals(first), "the orb painted a different frame with the motion switch off").toBe(true);
});
