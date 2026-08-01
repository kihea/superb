// Dev-time tool, not run at build time: read a flat-background brand PNG
// (the identity kit's own renders are RGB, no alpha -- file(1) reports PNG
// colour type 2) and write a true-alpha version, treating near-black pixels
// as transparent, with a soft ramp at the threshold so letterform
// anti-aliasing doesn't get a hard cutout. Run once per source asset;
// page/brand/ ships the output, not this script's input.
//
// Usage: node scripts/make-transparent.mjs <in.png> <out.png> [threshold] [ramp]
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const [, , inPath, outPath, thresholdArg, rampArg] = process.argv;
const threshold = Number(thresholdArg ?? 24); // luminance below this -> fully transparent
const ramp = Number(rampArg ?? 20); // luminance range over which alpha ramps 0->255

const inputB64 = readFileSync(inPath).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage();
const dataUrl = await page.evaluate(
  async ({ inputB64, threshold, ramp }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + inputB64;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      let alpha;
      if (luma <= threshold) alpha = 0;
      else if (luma >= threshold + ramp) alpha = 255;
      else alpha = Math.round(((luma - threshold) / ramp) * 255);
      d[i + 3] = alpha;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  },
  { inputB64, threshold, ramp },
);
await browser.close();

const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
writeFileSync(outPath, Buffer.from(base64, 'base64'));
console.log(`wrote ${outPath}`);
