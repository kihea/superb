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
import { APP_BASE } from './assemble.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const RETIRED_BUNDLE_SHA256 = 'db1f30f4c1fd99ed181bd26b820f1daf8f5aaa8324d4ea1b88a20ba1a1fc7c38';
const ALLOWED_LANDING_HOSTS = new Set(['unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com']);
// Hosts a landing file may *name* without ever loading from: the footer's
// source link. Only the static text scan consults this; the runtime request
// check below stays on ALLOWED_LANDING_HOSTS alone, so a script that actually
// fetched from github.com would still fail the browser-side check.
const ALLOWED_NAMED_HOSTS = new Set([...ALLOWED_LANDING_HOSTS, 'github.com']);

// Extensions skipped by the host scan below. This is a deny-list on purpose,
// and the reason is the whole history of this check. It has now been defeated
// three times, each time the same way: the guard identified the danger by what
// it was *called* -- first a basename, then a content hash, then an allow-list
// of extensions to bother reading. A verifier saved a digest-shifted copy of
// the retired bundle as `tracker.JS`, uppercase, and it passed both the hash pin
// and the scan, because `path.extname` returns `.JS` and the allow-list held
// `.js`. An allow-list of things to look at has to predict every disguise; a
// deny-list of things that cannot carry a URL does not.
//
// Everything not listed here is read as latin1, which cannot throw on binary
// input and simply finds nothing in it -- so adding an *unlisted* asset type
// never silently removes it from the scan.
//
// WHAT THIS STILL DOES NOT CATCH, because a verifier proved it rather than
// imagined it, and because the sentence above is easy to over-read. Files on
// this deny-list are not opened at all, so a `.png` containing JavaScript text
// is invisible here -- and the landing already ships `support.js`, whose
// dc-runtime fetches a URL, transforms the response and evals it. One scanned
// `.js` that fetches an unscanned `.png` and evals it reaches jsDelivr with
// this check green. That was demonstrated end to end, not argued.
//
// So read this scan as a lint, not as a boundary. A content scanner cannot
// decide what arbitrary bytes will do once something fetches and evaluates
// them; only the browser can, and the mechanism for that is a
// Content-Security-Policy pinning `script-src` and `connect-src` to the same
// hosts this file allows. That is the real fix and it is filed, not done.
// Until it exists, this check raises the cost of shipping the retired bundle
// back and does not make it impossible.
const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.wasm', '.mp4', '.webm', '.zip', '.pdf']);

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
const disallowedStaticUrls = [];
for (const entry of readdirSync(DIST, { recursive: true })) {
  const relative = String(entry);
  if (relative.split(/[\\/]/)[0] === 'read') continue;
  const file = path.join(DIST, relative);
  if (!statSync(file).isFile() || BINARY_EXTENSIONS.has(path.extname(relative).toLowerCase())) continue;
  const text = readFileSync(file, 'latin1');
  // ';' ends the match: it is a legal WHATWG hostname code point, so the CSP
  // value `https://unpkg.com;` in dist/_headers otherwise parses to the
  // hostname "unpkg.com;" and misses the allowlist that approves unpkg.com.
  for (const match of text.matchAll(/https?:[\\/]*[^\s"'<>`);]+/gi)) {
    // A URL-shaped substring in a comment or a minified string is not
    // necessarily a URL. `new URL` throws on those, and an uncaught throw here
    // takes the gate down with a raw stack trace instead of a named failure --
    // which fails closed, but a gate that crashes is a gate somebody eventually
    // loosens to stop it crashing. Skip what does not parse; the hostname
    // regex is what this check actually needs.
    let hostname;
    try {
      hostname = new URL(match[0]).hostname;
    } catch {
      continue;
    }
    if (!ALLOWED_NAMED_HOSTS.has(hostname)) {
      disallowedStaticUrls.push(`${relative}: ${match[0]}`);
    }
  }
}
if (disallowedStaticUrls.length > 0) {
  console.error(
    `check-assembled: landing artifact names unapproved external hosts:\n  ${disallowedStaticUrls.join('\n  ')}`,
  );
  process.exit(1);
}

// Issue #126: dist/_headers carries the Content-Security-Policy that is the
// actual boundary now (assemble.mjs's own comment on why the file-content
// scanner above cannot be one). A local server that never applies it would
// let every check below pass against an artifact that, live, ships without
// its own defence -- so this parses the real file (Cloudflare Pages' own
// path-block format: an unindented path line, then one or more indented
// "Header: value" lines) and sends the matching headers on every response,
// the same way the checks two blocks down for "/" and "/read/" already
// exercise the real dist/_redirects rather than assuming routing works.
const HEADERS_PATH = path.join(DIST, '_headers');
if (!existsSync(HEADERS_PATH)) {
  console.error('check-assembled: dist/_headers missing -- assemble.mjs should always write one (issue #126).');
  process.exit(1);
}

function parseHeadersFile(text) {
  const blocks = [];
  let current = null;
  for (const rawLine of text.split('\n')) {
    if (rawLine.trim() === '' || rawLine.trim().startsWith('#')) continue;
    if (!/^\s/.test(rawLine)) {
      current = { path: rawLine.trim(), headers: {} };
      blocks.push(current);
      continue;
    }
    if (!current) continue; // an indented line before any path header names -- not this format.
    const colon = rawLine.indexOf(':');
    if (colon === -1) continue;
    current.headers[rawLine.slice(0, colon).trim()] = rawLine.slice(colon + 1).trim();
  }
  return blocks;
}

function headersFor(blocks, pathname) {
  let matched = {};
  for (const block of blocks) {
    const isMatch = block.path.endsWith('/*')
      ? pathname.startsWith(block.path.slice(0, -1))
      : block.path === pathname;
    if (isMatch) matched = { ...matched, ...block.headers };
  }
  return matched;
}

const headerBlocks = parseHeadersFile(readFileSync(HEADERS_PATH, 'utf-8'));
const cspBlocks = headerBlocks.filter((b) => 'Content-Security-Policy' in b.headers);
if (cspBlocks.length === 0) {
  console.error('check-assembled: dist/_headers has no Content-Security-Policy rule at all (issue #126).');
  process.exit(1);
}
if (!headerBlocks.some((b) => b.path === '/' && 'Content-Security-Policy' in b.headers))
  console.error('check-assembled: warning -- no Content-Security-Policy rule for the exact landing path "/".');
if (!headerBlocks.some((b) => b.path === `${APP_BASE}*` && 'Content-Security-Policy' in b.headers))
  console.error(`check-assembled: warning -- no Content-Security-Policy rule for "${APP_BASE}*".`);

// Issue #124: the deep-link rules in dist/_redirects are part of the artifact
// under test, and the production incident that reopened the issue was a rule
// Cloudflare accepted and silently ignored. This server applies the real file
// with the semantics `wrangler pages dev` demonstrated: rules are evaluated
// BEFORE static assets, `/*` sources match by prefix, and an extensionless
// target resolves to its `.html` asset (the pretty-URL canonical form).
const REDIRECTS_PATH = path.join(DIST, '_redirects');
if (!existsSync(REDIRECTS_PATH)) {
  console.error('check-assembled: dist/_redirects missing -- assemble.mjs should always write one (issue #124).');
  process.exit(1);
}
const redirectRules = readFileSync(REDIRECTS_PATH, 'utf-8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('#'))
  .map((line) => line.split(/\s+/))
  .filter((parts) => parts.length >= 2)
  .map(([source, target, status]) => ({ source, target, status: Number(status ?? '200') }));
function redirectFor(pathname) {
  for (const rule of redirectRules) {
    const hit = rule.source.endsWith('/*')
      ? pathname.startsWith(rule.source.slice(0, -1))
      : rule.source === pathname;
    if (hit) return rule;
  }
  return null;
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
  const rule = redirectFor(p);
  const resolved = rule && rule.status === 200 ? rule.target : p;
  let filePath = resolved.endsWith('/') ? `${resolved}index.html` : resolved;
  if (!existsSync(path.join(DIST, filePath)) && path.extname(filePath) === '') filePath = `${filePath}.html`;
  const extraHeaders = headersFor(headerBlocks, p);
  try {
    const body = readFileSync(path.join(DIST, filePath));
    res.writeHead(200, { 'content-type': TYPES[path.extname(filePath)] ?? 'application/octet-stream', ...extraHeaders });
    res.end(body);
  } catch {
    res.writeHead(404, extraHeaders);
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
    return (url.hostname !== '127.0.0.1' && !ALLOWED_LANDING_HOSTS.has(url.hostname))
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

// --- deep links (issue #124): the enumerated rules serve the app document,
// with the app's own policy, without touching the address path. Exercised
// through the same server that applies the real dist/_redirects above.
{
  const appDocument = readFileSync(path.join(DIST, 'read-app.html'));
  const appIndex = readFileSync(path.join(DIST, 'read', 'index.html'));
  if (!appDocument.equals(appIndex))
    problems.push('read-app.html has drifted from read/index.html -- assemble.mjs writes it as an exact copy');
  for (const deepPath of [`${APP_BASE}library`, `${APP_BASE}book/bram-stoker_dracula`, `${APP_BASE}book/bram-stoker_dracula/read`]) {
    const res = await fetch(`${origin}${deepPath}`);
    const body = Buffer.from(await res.arrayBuffer());
    if (res.status !== 200 || !body.equals(appDocument)) {
      problems.push(`${deepPath} : does not serve the app document through dist/_redirects (status ${res.status})`);
      continue;
    }
    const csp = res.headers.get('content-security-policy') ?? '';
    if (!csp.includes("default-src 'self'"))
      problems.push(`${deepPath} : rewritten deep route arrives without a Content-Security-Policy`);
  }
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
