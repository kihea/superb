// The composed-passage reading state lives at /play/prose now, behind a
// door screen that says what the passage is before showing it. Every spec
// that audits the reading surface walks in the same way a reader does:
// through the door.
import { expect, type Page } from "@playwright/test";

/** Navigates to the prose game and opens the passage. */
export async function openProse(page: Page): Promise<void> {
  await page.goto("/play/prose");
  await reopenProse(page);
}

/** Presses "Open the passage" on a door already on screen -- what a reload
 *  lands on, since the door closes again between sessions. */
export async function reopenProse(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open the passage" }).click();
  // Same parallel-worker contention window the old suite documented: many
  // workers against one preview server can starve the first paint well past
  // the default expect timeout without anything being wrong.
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });
}
