#!/usr/bin/env node
// T10 job 4: prove the two surfaces together. Serves the *assembled*
// artifact (npm run assemble must have run first -- this reads dist/ as it
// is, it does not build anything) over http and opens both "/" and "/read/"
// in a real browser.
//
// Fails if:
//   - the landing renders an empty body, clips a link at phone width, exposes
//     a dead link, lacks a route to /read/, or loses an asset from the assembled
//     artifact.
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
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const RETIRED_BUNDLE_SHA256 = 'db1f30f4c1fd99ed181bd26b820f1daf8f5aaa8324d4ea1b88a20ba1a1fc7c38';

if (!existsSync(path.join(DIST, 'index.html'))) {
  console.error('check-assembled: dist/index.html missing -- run `npm run assemble` first.');
  process.exit(1);
}
if (!existsSync(path.join(DIST, 'read', 'index.html'))) {
  console.error('check-assembled: missing dist/read/index.html; run npm run assemble first');
  process.exit(1);
}
const retiredBundle = readdirSync(DIST, { recursive: true }).find((entry) => {
  const relative = String(entry);
  const file = path.join(DIST, relative);
  if (path.basename(relative) === '_ds_bundle.js') return true;
  if (!statSync(file).isFile()) return false;
  const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
  return digest === RETIRED_BUNDLE_SHA256;
});
if (retiredBundle) {
  console.error(`check-assembled: retired design-system runtime bytes are still shipped: ${retiredBundle}`);
  process.exit(1);
}

// The check above pins one artifact: the exact bytes of the retired bundle, at
// any name. That closes the rename, and a verifier had to be shown the rename
// before it was closed -- the first version matched a basename, and copying the
// same bytes back as `_ds_bundle_v2.js` walked straight past it.
//
// A hash still only knows the one file it was taken from. Change a byte and it
// forgets. So this second check is keyed on the hazard instead of the artifact:
// what made that bundle dangerous was fetching markup from a remote host and
// inserting it into the page, so every shipped byte of the landing surface is
// read and any external host it names is compared against the same allow-list
// the runtime request check below uses. It catches the retired bundle after any
// edit that leaves the fetch in, and it catches a new file nobody has hashed.
//
// The runtime check stays as well, for the case neither of these can see: a URL
// assembled at runtime from pieces that never appear in the source as one
// string. Three checks, three different things they are good at.
//
// `dist/read/` is excluded. That is the reading app's own build, gated by
// web.yml, and its React bundle carries documentation URLs inside error strings
// that are read by a human and fetched by nobody.
const ALLOWED_EXTERNAL_HOSTS = new Set(['unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com']);

const embeddedHosts = [];
for (const entry of readdirSync(DIST, { recursive: true }).map(String)) {
  if (entry.split(path.sep).includes('read')) continue;
  const file = path.join(DIST, entry);
  if (!statSync(file).isFile()) continue;
  for (const [, host] of readFileSync(file, 'latin1').matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)) {
    if (host === 'localhost' || host === '127.0.0.1') continue;
    if (ALLOWED_EXTERNAL_HOSTS.has(host)) continue;
    embeddedHosts.push(`${entry} -> ${host}`);
  }
}
if (embeddedHosts.length > 0) {
  console.error(
    `check-assembled: the landing ships files naming external hosts that are not allowed --\n    ${[...new Set(embeddedHosts)].join('\n    ')}`,
  );
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
  // Keep the visual source flexible while pinning the few properties a
  // publishable landing page owes readers.
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const failedRequests = [];
  const requestedUrls = [];
  page.on('request', (req) => requestedUrls.push(req.url()));
  page.on('requestfailed', (req) => failedRequests.push(`${req.url()} (${req.failure()?.errorText})`));
  page.on('response', (res) => {
    if (res.status() >= 400) failedRequests.push(`${res.url()} -> ${res.status()}`);
  });
  await page.goto(`${origin}/`);
  await page.waitForLoadState('networkidle').catch(() => {});
  const landing = await page.evaluate(() => ({
    hasContent: (document.body?.textContent ?? '').trim().length > 0,
    viewportWidth: document.documentElement.clientWidth,
    contentWidth: document.documentElement.scrollWidth,
    links: Array.from(document.querySelectorAll('a')).map((link) => {
      const rect = link.getBoundingClientRect();
      return {
        text: (link.textContent ?? '').trim().replace(/\s+/g, ' '),
        href: link.getAttribute('href'),
        left: rect.left,
        right: rect.right,
      };
    }),
  }));
  await page.close();
  if (!landing.hasContent) problems.push('/ : the landing rendered an empty body');
  if (landing.contentWidth > landing.viewportWidth)
    problems.push(`/ : landing overflows a 390px phone viewport (${landing.contentWidth}px content in ${landing.viewportWidth}px)`);
  const deadLinks = landing.links.filter(({ href }) => href == null || href.trim() === '' || href.trim() === '#');
  if (deadLinks.length > 0)
    problems.push(`/ : landing contains dead links -- ${deadLinks.map(({ text }) => JSON.stringify(text)).join(', ')}`);
  const clippedLinks = landing.links.filter(({ left, right }) => left < 0 || right > landing.viewportWidth);
  if (clippedLinks.length > 0)
    problems.push(`/ : landing clips links at phone width -- ${clippedLinks.map(({ text }) => JSON.stringify(text)).join(', ')}`);
  if (!landing.links.some(({ href }) => href === '/read/'))
    problems.push('/ : landing has no working link to the reading app at /read/');
  if (failedRequests.length > 0)
    problems.push(`/ : failed requests on the landing --\n    ${failedRequests.join('\n    ')}`);

  const disallowedRequests = requestedUrls.filter((raw) => {
    const url = new URL(raw);
    return (url.hostname !== '127.0.0.1' && !ALLOWED_EXTERNAL_HOSTS.has(url.hostname))
      || url.pathname.endsWith('/_ds_bundle.js');
  });
  if (disallowedRequests.length > 0)
    problems.push(`/ : landing loads an unapproved runtime or external host --\n    ${disallowedRequests.join('\n    ')}`);
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
  console.log('check-assembled: landing at / fits a phone with live links, and /read/ reaches a painted passage.');
}

process.exit(failed ? 1 : 0);
