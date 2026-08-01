// Issue #121: a corrupted engine record left the reading screen stuck on
// "Finding something to read." forever, with no retry and no reset --
// found by an independent verifier corrupting the saved IndexedDB record
// and reloading. This is that reproduction, kept as a permanent regression
// guard, plus the recovery path it should have had all along.
import { test, expect, type Page } from "@playwright/test";

async function corruptEngineState(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("superb-web");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("engine", "readwrite");
      // Not JSON at all -- the shape a real disk/quota fault or a future
      // build's incompatible schema change could plausibly leave behind.
      // engine.load() is documented to reject this with a typed error
      // rather than panic (crates/superb-wasm/src/lib.rs's own test), which
      // is exactly the path useEngineSession.ts's boot() must catch.
      tx.objectStore("engine").put("{not valid json", "state");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

async function readEngineStateRaw(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("superb-web");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction("engine", "readonly");
      const req = tx.objectStore("engine").get("state");
      req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  });
}

test("a corrupted engine record shows the calm retry/reset screen, never a permanent loader", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });

  await corruptEngineState(page);
  await page.reload();

  // Not stuck on the shimmer text forever -- the recovery screen replaces
  // it once the boot sequence's own try/catch (useEngineSession.ts) lands
  // on "error" instead of leaving the promise chain unhandled.
  await expect(page.locator(".reading-status-recovery")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  const startOver = page.getByRole("button", { name: "Start over" });
  await expect(startOver).toBeVisible();

  // Retrying alone cannot fix a corrupted document still sitting on disk --
  // it lands back on the same recovery screen rather than hanging.
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".reading-status-recovery")).toBeVisible({ timeout: 15_000 });

  // Start over recovers a real, working session -- and does not silently
  // discard data in the sense that matters here: it is the reader's own
  // explicit action, not something the app did unasked, and what it leaves
  // behind is a fresh, valid document rather than nothing at all.
  await startOver.click();
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });

  const recovered = await readEngineStateRaw(page);
  expect(recovered).not.toBeNull();
  expect(() => JSON.parse(recovered!)).not.toThrow();

  // And the recovery holds across a reload -- not a one-time fluke of the
  // in-memory session state.
  await page.reload();
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });
});
