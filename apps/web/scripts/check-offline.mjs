// Verifies the PWA claim -- "offline load works with the network off" --
// against a running production preview (npm run build && npm run preview --
// --port 4319 --strictPort). Checks both a reload and a fresh cold
// navigation while offline.
//
// This script used to print its failures and exit 0, and nothing ran it. It
// is how offline reading was able to break and stay broken: the engine's
// .wasm was missing from the service worker's precache pattern for however
// long, and the one instrument pointed at that fact could not go red. It
// exits non-zero now, and web.yml runs it on every push.
//
// Two things this deliberately does NOT do. It does not start the preview
// server -- the caller does, so a failure here is never a failure to boot.
// And it waits for `.passage-page`, the real passage from the real engine,
// rather than for the shell: the shell painting while the engine 404s is
// exactly the failure that went unnoticed, and "the page loaded" would have
// called it a pass.

import { chromium } from "@playwright/test";

const ORIGIN = process.env.SUPERB_PREVIEW_ORIGIN ?? "http://localhost:4319";
const failures = [];

async function report(label, run) {
  try {
    await run();
    console.log(`${label}: OK`);
  } catch (error) {
    console.log(`${label}: FAILED — ${error.message}`);
    failures.push(label);
  }
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(ORIGIN);
await page.waitForSelector(".passage-page");

// Give the service worker a moment to finish installing/activating and the
// precache to populate.
await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true), null, { timeout: 15000 });
await page.waitForTimeout(1500);

const swState = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  return reg.active?.state ?? "none";
});
console.log("service worker state:", swState);
if (swState !== "activated") failures.push("service worker never activated");

await context.setOffline(true);
await report("offline reload renders a passage", async () => {
  await page.reload();
  await page.waitForSelector(".passage-page", { timeout: 10000 });
});
if (failures.length > 0) {
  console.log("body:", (await page.locator("body").innerText()).slice(0, 300));
}

// A fresh navigation, not just a reload -- the real cold offline load.
await context.setOffline(false);
await page.close();

const page2 = await context.newPage();
await context.setOffline(true);
await report("offline cold navigation renders a passage", async () => {
  await page2.goto(ORIGIN, { timeout: 10000 });
  await page2.waitForSelector(".passage-page", { timeout: 10000 });
});

// A deep route offline, which is new: the app has routes now, and the
// service worker's navigateFallback is what makes them survive.
await report("offline deep route renders", async () => {
  await page2.goto(`${ORIGIN}/shelf`, { timeout: 10000 });
  await page2.waitForSelector(".sb-screen", { timeout: 10000 });
});

await browser.close();

if (failures.length > 0) {
  console.error(`\noffline check FAILED (${failures.length}): ${failures.join(", ")}`);
  process.exit(1);
}
console.log("\noffline check passed");
