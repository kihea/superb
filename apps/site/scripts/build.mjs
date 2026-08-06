#!/usr/bin/env node
// The landing keeps Kihea's designed page as its visual source. The previous
// build generated a second page from data/figures.json; that machinery remains
// retired. Small shipping edits now live directly in page/: honest copy,
// working links, and a phone-safe header.
//
// This build copies page/ into dist/, names the landing index.html, and
// prints the library page from the real catalogue index -- one row per
// shipped book, grouped by kind, linking into the reading app. The library
// is generated rather than hand-kept so it can never drift from what the
// app actually serves.

import { cpSync, rmSync, renameSync, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, 'page');
const DIST = path.join(ROOT, 'dist');
const CATALOGUE_INDEX = path.resolve(ROOT, '..', '..', 'content', 'catalogue', 'index-v1.json');

try {
  rmSync(DIST, { recursive: true, force: true });
} catch {
  // Windows: an indexer or sync agent can hold the directory's own inode
  // open while everything inside stays deletable. Emptying it is the same
  // fresh start for a build that only ever writes into DIST.
  for (const entry of readdirSync(DIST)) rmSync(path.join(DIST, entry), { recursive: true, force: true });
}
cpSync(PAGE, DIST, { recursive: true });

const dc = path.join(DIST, 'Superb Landing.dc.html');
if (!existsSync(dc)) {
  console.error('build: page/Superb Landing.dc.html missing — nothing to serve.');
  process.exit(1);
}
renameSync(dc, path.join(DIST, 'index.html'));

// ---- the library page, printed from content/catalogue/index-v1.json ----

const KINDS = ['Fiction', 'Nonfiction', 'Poetry', 'Drama', 'Philosophy', 'Biography & Memoir'];
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function kindOf(row) {
  for (const kind of KINDS) if ((row.categories ?? []).includes(kind)) return kind;
  return 'More';
}

const index = JSON.parse(readFileSync(CATALOGUE_INDEX, 'utf-8'));
const groups = new Map([...KINDS, 'More'].map((k) => [k, []]));
for (const row of index.books) groups.get(kindOf(row)).push(row);
for (const rows of groups.values()) {
  // A book may honestly have no author on record (anonymous works); it
  // sorts under empty rather than crashing the whole printed library.
  rows.sort(
    (a, b) => (a.author ?? '').localeCompare(b.author ?? '') || (a.title ?? '').localeCompare(b.title ?? ''),
  );
}

const groupsHtml = [...groups.entries()]
  .filter(([, rows]) => rows.length > 0)
  .map(
    ([kind, rows]) => `  <section class="lib-group">
    <h2>${esc(kind)} <span class="lib-count">${rows.length}</span></h2>
    <div class="lib-grid">
${rows
  .map(
    (row) =>
      `      <a class="lib-book" href="/read/book/${esc(row.id)}"><b>${esc(row.title)}</b><i>${esc(
        row.author,
      )}${row.translator ? ', translated by ' + esc(row.translator) : ''}</i></a>`,
  )
  .join('\n')}
    </div>
  </section>`,
  )
  .join('\n\n');

const libraryHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Every book in Superb: ${index.bookCount} public-domain books, free to read.">
<link rel="icon" type="image/png" sizes="16x16" href="/brand/favicon-16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/brand/favicon-32.png">
<title>Library — Superb</title>
<link rel="stylesheet" href="/_ds/superb-design-system-467bc2d6-26c3-4bef-a0b0-a971996a1a41/tokens/colors.css">
<link rel="stylesheet" href="/_ds/superb-design-system-467bc2d6-26c3-4bef-a0b0-a971996a1a41/tokens/typography.css">
<link rel="stylesheet" href="/_ds/superb-design-system-467bc2d6-26c3-4bef-a0b0-a971996a1a41/tokens/spacing.css">
<link rel="stylesheet" href="/_ds/superb-design-system-467bc2d6-26c3-4bef-a0b0-a971996a1a41/tokens/base.css">
<link rel="stylesheet" href="/fonts/fonts.css">
<link rel="stylesheet" href="/site.css">
<script src="/library.js" defer></script>
</head>
<body data-theme="oxblood-dark">

<header class="pg-header">
  <a href="/"><img src="/brand/lockup-night.png" alt="Superb"></a>
  <nav>
    <a href="/library/" aria-current="page">Library</a>
    <a href="/about/">About</a>
    <a href="/open-source/" class="pg-nav-wide">Open source</a>
    <a href="/read/" style="color:var(--brand)">Read</a>
  </nav>
</header>

<main class="pg-main">
  <div>
    <span class="pg-eyebrow">Library</span>
    <h1 class="pg-title">${index.bookCount} books, all free, all yours.</h1>
    <p class="pg-lede">Every book here is public domain and carries its own provenance record. Open one and it becomes yours to read — on this device, offline, no account.</p>
  </div>

  <label class="lib-search">
    <span>›</span>
    <input id="lib-search" type="search" placeholder="Search by title or author" autocomplete="off">
  </label>
  <p class="lib-none" id="lib-none">Nothing by that name here yet. The catalogue takes requests — open an issue on GitHub.</p>

${groupsHtml}
</main>

<footer class="pg-footer">
  <div class="pg-footer__base">
    <span>Superb. Source-available, MIT + Commons Clause.</span>
    <a href="https://github.com/kihea/superb">GitHub</a>
  </div>
</footer>

</body>
</html>
`;

mkdirSync(path.join(DIST, 'library'), { recursive: true });
writeFileSync(path.join(DIST, 'library', 'index.html'), libraryHtml);

console.log(
  'built into ' + DIST + ' (Kihea’s visual source, shipping edits included; library page printed from ' +
    index.bookCount + ' catalogue rows)',
);
