#!/usr/bin/env node
// Issue #93: the header nav ran off the right edge of a phone, and the
// review that approved this page had only ever looked at it at desktop
// width. This makes phone width a gate rather than a habit — the page is
// opened in a real browser at phone widths first (320, 390), then desktop,
// and the check fails if the page scrolls sideways or any header link's
// right edge leaves the viewport.
//
// It measures the BUILT page in dist/, served over http (the stylesheets
// are referenced by absolute path, so file:// renders unstyled and would
// measure nothing real). Needs a browser: `npx playwright install chromium`
// once, locally; CI does this itself. Everything else in `npm run test`
// stays browser-free.

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');

if (!existsSync(path.join(DIST, 'index.html'))) {
  console.error('check-phone: dist/index.html missing — run `npm run build` first.');
  process.exit(1);
}

// Phone first, on purpose (issue #93): the widths most visitors actually
// arrive at are the ones checked before the comfortable one.
const WIDTHS = [320, 390, 1280];

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
const server = createServer((req, res) => {
  const p = req.url === '/' ? '/index.html' : (req.url ?? '/').split('?')[0];
  try {
    const body = readFileSync(path.join(DIST, p));
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
const address = /** @type {import('node:net').AddressInfo} */ (server.address());
const url = `http://127.0.0.1:${address.port}/`;

const browser = await chromium.launch();
let failed = false;

for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  await page.goto(url);
  // The web fonts come from an external host; measuring with fallback
  // metrics is fine (a nav that only fits in one font family is already
  // broken), so a failed font fetch is not waited on.
  await page.waitForLoadState('networkidle').catch(() => {});

  const r = await page.evaluate(() => {
    const nav = document.querySelector('.site-header nav');
    const links = nav
      ? [...nav.querySelectorAll('a')].map((a) => ({
          text: a.textContent ?? '',
          right: Math.round(a.getBoundingClientRect().right),
        }))
      : [];
    return {
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      navFound: nav !== null,
      links,
    };
  });
  await page.close();

  const problems = [];
  if (!r.navFound) problems.push('no .site-header nav on the page');
  if (r.scrollWidth > r.viewport)
    problems.push(`page scrolls sideways: content is ${r.scrollWidth}px on a ${r.viewport}px screen`);
  for (const l of r.links)
    if (l.right > r.viewport)
      problems.push(`"${l.text.trim()}" ends at ${l.right}px, past the ${r.viewport}px edge`);

  if (problems.length > 0) {
    failed = true;
    console.error(`✗ ${width}px:`);
    for (const p of problems) console.error(`    ${p}`);
  } else {
    console.log(`✓ ${width}px — nav and page fit (widest link edge ${Math.max(0, ...r.links.map((l) => l.right))}px)`);
  }
}


