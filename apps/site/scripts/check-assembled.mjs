#!/usr/bin/env node
// T10 job 4: prove the two surfaces together. Serves the *assembled*
// artifact (npm run assemble must have run first -- this reads dist/ as it
// is, it does not build anything) over http, exactly the way check-phone.mjs
// already proves the landing works over http rather than file://, and opens
// both "/" and "/read/" in a real browser.
//
// Fails if:
//   - the landing renders an empty body, or any asset Kihea's page
//     references fails to arrive from the assembled artifact (the page
//     itself is served verbatim and its markup is his -- nothing here
//     asserts against its structure).
//   - the app at "/read/" never reaches its first painted reading surface
//     (an <article class="passage-page">, PassagePage.tsx's own selector)
//     within a generous timeout, which is what "the subpath is wired
//     correctly end to end" cashes out to -- assets, the wasm engine, the
//     content fetch and the PWA registration all have to have worked for
//     that element to exist at all.
//
// Watched red (T10 PR body carries the transcript): pointed the browser at
// "/read/" while apps/web/vite.config.ts's BASE still defaulted to "/" --
// every asset 404'd against the assembled artifact's real "/read/" prefix
// and the passage selector never appeared.

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');

if (!existsSync(path.join(DIST, 'index.html'))) {
  console.error('check-assembled: dist/index.html missing -- run `npm run assemble` first.');
  process.exit(1);
}
if (!existsSync(path.join(DIST, 'read', 'index.html'))) {
  console.error('check-assembled: dist/read/index.html missing -- run `npm run assemble` first.');
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

const server = createServer((req, res) => {
  const p = (req.url ?? '/').split('?')[0];
  const filePath = p.endsWith('/') ? `${p}index.html` : p;
  try {
    const body = readFileSync(path.join(DIST, filePath));
    res.writeHead(200, { 'content-type': TYPES[path.extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
const address = /** @type {import('node:net').AddressInfo} */ (server.address());
const origin = `http://127.0.0.1:${address.port}`;

const browser = await chromium.launch();
let failed = false;
const problems = [];

// --- "/" : the landing arrives whole from the assembled artifact.
{
  // The landing is Kihea's own page served verbatim, so nothing here
  // asserts against its markup -- its structure is his to change without a
  // check going red. What the assembly owes it is that the page and every
  // asset it references actually arrive from the assembled artifact.
  const page = await browser.newPage();
  const failedRequests = [];
  page.on('requestfailed', (req) => failedRequests.push(`${req.url()} (${req.failure()?.errorText})`));
  page.on('response', (res) => {
    if (res.status() >= 400) failedRequests.push(`${res.url()} -> ${res.status()}`);
  });
  await page.goto(`${origin}/`);
  await page.waitForLoadState('networkidle').catch(() => {});
  const hasContent = await page.evaluate(() => (document.body?.textContent ?? '').trim().length > 0);
  await page.close();
  if (!hasContent) problems.push('/ : the landing rendered an empty body');
  if (failedRequests.length > 0)
    problems.push(`/ : failed requests on the landing --\n    ${failedRequests.join('\n    ')}`);
}

// --- "/read/" : the app reaches its first painted reading surface.
{
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  const failedRequests = [];
  page.on('requestfailed', (req) => failedRequests.push(`${req.url()} (${req.failure()?.errorText})`));
  page.on('response', (res) => {
    if (res.status() >= 400) failedRequests.push(`${res.url()} -> ${res.status()}`);
  });

  await page.goto(`${origin}/read/`);
  const reached = await page
    .waitForSelector('article.passage-page', { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  await page.close();

  if (!reached) problems.push('/read/ : article.passage-page never appeared (first painted reading surface)');
  if (failedRequests.length > 0)
    problems.push(`/read/ : failed network requests --\n    ${failedRequests.join('\n    ')}`);
  if (consoleErrors.length > 0)
    problems.push(`/read/ : console errors --\n    ${consoleErrors.join('\n    ')}`);
}

await browser.close();
server.close();

if (problems.length > 0) {
  failed = true;
  console.error('check-assembled: FAILED');
  for (const p of problems) console.error(`  ✗ ${p}`);
} else {
  console.log('check-assembled: landing at / arrives whole, and /read/ reaches a painted passage.');
}

process.exit(failed ? 1 : 0);
