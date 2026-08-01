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
//   - a deep route under /read/ -- a restored tab, a bookmarked or shared
//     book link -- does not reach that same reading surface (issue #124).
//
// Watched red (T10 PR body carries the transcript): pointed the browser at
// "/read/" while apps/web/vite.config.ts's BASE still defaulted to "/" --
// every asset 404'd against the assembled artifact's real "/read/" prefix
// and the passage selector never appeared.
//
// Issue #124: this local server used to answer every unmatched path with a
// plain 404, which is not how the real host behaves -- Cloudflare Pages
// reads dist/_redirects and rewrites a matching path before ever reaching
// its own 404 handling. A check that never exercises that file cannot catch
// a regression in it (an assemble.mjs edit that stops writing it, writes it
// with the wrong rule, or writes it somewhere this artifact does not ship
// it from) even though exactly that class of bug is what left a restored
// tab or a shared book link on the marketing page in production. This
// server now parses dist/_redirects itself, the same status-200-rewrite
// rule Cloudflare's own docs describe, so the deep-route checks below are
// exercising the artifact's own routing contract rather than this script's
// prior guess at what "should" work.

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
const REDIRECTS_PATH = path.join(DIST, '_redirects');
if (!existsSync(REDIRECTS_PATH)) {
  console.error('check-assembled: dist/_redirects missing -- assemble.mjs should always write one.');
  process.exit(1);
}

/** Cloudflare Pages' own `_redirects` syntax: one rule per line, whitespace-
 *  separated `source destination [status]`, `#` comments and blank lines
 *  skipped. Only the one shape this artifact actually writes is supported
 *  -- a trailing `/*` wildcard rewritten (status 200) to a fixed
 *  destination -- because that is the only rule this pipeline produces;
 *  this is a fidelity check against a known artifact, not a general
 *  `_redirects` implementation. */
function parseRedirects(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const [source, destination, status] = line.split(/\s+/);
      return { source, destination, status: status ? Number(status) : 301 };
    });
}

function matchRedirect(rules, pathname) {
  for (const rule of rules) {
    if (rule.source.endsWith('/*')) {
      const prefix = rule.source.slice(0, -1); // keeps the trailing slash
      if (pathname.startsWith(prefix)) return rule;
    } else if (rule.source === pathname) {
      return rule;
    }
  }
  return null;
}

const redirectRules = parseRedirects(readFileSync(REDIRECTS_PATH, 'utf-8'));
if (redirectRules.length === 0) {
  console.error('check-assembled: dist/_redirects parsed to zero rules -- the file exists but says nothing.');
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
  const requested = (req.url ?? '/').split('?')[0];
  let servedPath = requested.endsWith('/') ? `${requested}index.html` : requested;

  // A real file on disk always wins (this is what Cloudflare Pages itself
  // does: static assets are checked before _redirects rules run) --
  // `_redirects` only ever applies to a path with no matching asset.
  if (!existsSync(path.join(DIST, servedPath))) {
    const rule = matchRedirect(redirectRules, requested);
    if (rule && rule.status === 200) servedPath = rule.destination;
  }

  try {
    const body = readFileSync(path.join(DIST, servedPath));
    res.writeHead(200, { 'content-type': TYPES[path.extname(servedPath)] ?? 'application/octet-stream' });
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

// --- deep routes under /read/ (issue #124): a restored tab, a bookmarked
// or shared book link, or a made-up path all have to land on the app
// shell -- App.tsx's own root, which then decides in the browser what to
// render -- never on the marketing landing page's own document. Distinct
// from the "/read/" check above: that one proves the app boots; this one
// proves a path with no matching file on disk still reaches the app at
// all, which is exactly the step the plain-404 version of this server
// could never exercise (see this file's own comment on the parser above).
for (const deepPath of ['/read/library', '/read/book/bram-stoker_dracula', '/read/nonexistent-route-xyz']) {
  const page = await browser.newPage();
  const failedRequests = [];
  page.on('requestfailed', (req) => failedRequests.push(`${req.url()} (${req.failure()?.errorText})`));
  page.on('response', (res) => {
    if (res.status() >= 400) failedRequests.push(`${res.url()} -> ${res.status()}`);
  });

  const response = await page.goto(`${origin}${deepPath}`);
  const isAppShell = await page.evaluate(() => document.getElementById('root') !== null);
  await page.close();

  if (response && response.status() >= 400)
    problems.push(`${deepPath} : responded ${response.status()} instead of the app shell`);
  if (!isAppShell)
    problems.push(`${deepPath} : served the marketing landing (no #root) instead of the app`);
  if (failedRequests.length > 0)
    problems.push(`${deepPath} : failed network requests --\n    ${failedRequests.join('\n    ')}`);
}

await browser.close();
server.close();

if (problems.length > 0) {
  failed = true;
  console.error('check-assembled: FAILED');
  for (const p of problems) console.error(`  ✗ ${p}`);
} else {
  console.log(
    'check-assembled: landing at / arrives whole, /read/ reaches a painted passage, and deep /read/* routes reach the app shell.',
  );
}

process.exit(failed ? 1 : 0);
