// Verifies PWA installability against a running production preview
// (npm run build && npm run preview -- --port 4319 --strictPort). Uses
// Chrome's own Page.getInstallabilityErrors CDP call directly -- Lighthouse
// 11+ dropped the standalone "pwa" report category, so this is the same
// signal without fighting a deprecated flag.

import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage();
const client = await page.context().newCDPSession(page);
await page.goto("http://localhost:4319/", { waitUntil: "networkidle" });
const errors = await client.send("Page.getInstallabilityErrors");
console.log(JSON.stringify(errors, null, 2));
const manifest = await client.send("Page.getAppManifest");
console.log("manifest url:", manifest.url);
console.log("manifest errors:", JSON.stringify(manifest.errors ?? [], null, 2));
await browser.close();
