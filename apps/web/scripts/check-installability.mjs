// Verifies PWA installability against a running production preview
// (npm run build && npm run preview -- --port 4319 --strictPort). Uses
// Chrome's own Page.getInstallabilityErrors CDP call directly -- Lighthouse
// 11+ dropped the standalone "pwa" report category, so this is the same
// signal without fighting a deprecated flag.
//
// Like check-offline.mjs, this printed its findings and exited 0. Both exit
// non-zero now and both run in web.yml, because an instrument nothing looks
// at and that cannot go red is not an instrument.
//
// What this can and cannot catch, watched rather than assumed. A malformed
// manifest fails it: served `{ this is not json`, Chrome reported
// `critical: 1, "Line: 1, column: 3, Syntax error."` and the script exited
// 1. Emptying the icons array did NOT fail it -- headless Chrome returns an
// empty `installabilityErrors` either way. So this is a manifest-integrity
// check with an installability check bolted on that is weaker headless than
// it looks. Do not read a pass here as "Chrome would offer to install it".

import { chromium } from "@playwright/test";

const ORIGIN = process.env.SUPERB_PREVIEW_ORIGIN ?? "http://localhost:4319";

const browser = await chromium.launch();
const page = await browser.newPage();
const client = await page.context().newCDPSession(page);
await page.goto(ORIGIN, { waitUntil: "networkidle" });

const { installabilityErrors } = await client.send("Page.getInstallabilityErrors");
console.log("installability errors:", JSON.stringify(installabilityErrors, null, 2));

const manifest = await client.send("Page.getAppManifest");
console.log("manifest url:", manifest.url);
console.log("manifest errors:", JSON.stringify(manifest.errors ?? [], null, 2));

await browser.close();

// Chrome reports manifest "errors" that are only advice (a missing optional
// field, say) alongside real ones. Only the critical ones fail the build;
// the rest are printed above for a reader.
const fatalManifestErrors = (manifest.errors ?? []).filter((error) => error.critical);
const problems = [
  ...installabilityErrors.map((error) => error.errorId),
  ...fatalManifestErrors.map((error) => error.message),
];

if (problems.length > 0) {
  console.error(`\ninstallability check FAILED (${problems.length}): ${problems.join(", ")}`);
  process.exit(1);
}
console.log("\ninstallability check passed");
