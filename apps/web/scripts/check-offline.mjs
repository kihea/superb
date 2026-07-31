// Verifies the PWA DONE-list claim -- "offline load works with the network
// off" -- against a running production preview (npm run build && npm run
// preview -- --port 4319 --strictPort). Checks both a reload and a fresh
// cold navigation to the other register while offline.

import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

await page.goto("http://localhost:4319/");
await page.waitForSelector(".passage-page");

// Give the service worker a moment to finish installing/activating and
// the precache to populate.
await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true), null, { timeout: 15000 });
await page.waitForTimeout(1500);

const swState = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  return reg.active?.state ?? "none";
});
console.log("service worker state:", swState);

await context.setOffline(true);
await page.reload();
try {
  await page.waitForSelector(".passage-page", { timeout: 10000 });
  console.log("OFFLINE RELOAD: passage rendered OK");
} catch (e) {
  console.log("OFFLINE RELOAD FAILED:", e.message);
  console.log("body:", (await page.locator("body").innerText()).slice(0, 300));
}

// Also confirm a fresh navigation while offline (not just reload) works,
// since that is the real "cold offline load" case.
await context.setOffline(false);
await page.close();

const page2 = await context.newPage();
await context.setOffline(true);
try {
  await page2.goto("http://localhost:4319/", { timeout: 10000 });
  await page2.waitForSelector(".passage-page", { timeout: 10000 });
  console.log("OFFLINE FRESH NAV (paper): passage rendered OK");
} catch (e) {
  console.log("OFFLINE FRESH NAV FAILED:", e.message);
}

await browser.close();
