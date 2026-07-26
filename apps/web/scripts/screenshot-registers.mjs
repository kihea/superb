// Dev utility: captures both registers (dark and light variants) so they
// can be compared side by side outside a browser. Needs a production
// preview server already running at :4319 (npm run build && npm run preview
// -- --port 4319 --strictPort).

import { chromium } from "@playwright/test";

const base = "http://localhost:4319";
const outDir = process.argv[2];
if (!outDir) throw new Error("usage: node scripts/screenshot-registers.mjs <out-dir>");

const browser = await chromium.launch();

async function shot(name, url, width, height, colorScheme, action, selector = ".passage-page") {
  const page = await browser.newPage({ viewport: { width, height }, colorScheme });
  await page.goto(url);
  await page.waitForSelector(selector, { timeout: 15000 });
  if (action) await action(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  await page.close();
}

// Flagship: glass dark-first, paper as a well-set book in daylight.
await shot("glass-dark-mobile", `${base}/read?register=glass`, 390, 844, "dark");
await shot("glass-dark-desktop", `${base}/read?register=glass`, 1440, 960, "dark");
await shot("paper-light-mobile", `${base}/read?register=paper`, 390, 844, "light");
await shot("paper-light-desktop", `${base}/read?register=paper`, 1440, 960, "light");

// The other half of each register -- glass's real light theme, paper's
// night reading -- so the whole tokens surface is visible, not just half.
await shot("glass-light-desktop", `${base}/read?register=glass`, 1440, 960, "light");
await shot("paper-dark-desktop", `${base}/read?register=paper`, 1440, 960, "dark");

await shot("picker", `${base}/`, 900, 700, "light", null, ".picker");

await shot("glass-dark-gloss", `${base}/read?register=glass`, 390, 844, "dark", async (page) => {
  await page.locator(".passage-word").nth(1).click();
});
await shot("paper-light-gloss", `${base}/read?register=paper`, 390, 844, "light", async (page) => {
  await page.locator(".passage-word").nth(1).click();
});

await browser.close();
console.log("done");
