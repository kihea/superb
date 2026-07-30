#!/usr/bin/env node
// Builds the static site into dist/. No framework, no bundler — plain files,
// because there is nothing here that needs one (job 1). Never imports
// anything from apps/web.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTokens, tokensToCss } from '../src/tokens.mjs';
import { renderPage } from '../src/render.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, '..');
const APP_ROOT = path.resolve(SITE_ROOT, '..', '..');
const DIST = path.join(SITE_ROOT, 'dist');

function loadFigures() {
  const raw = readFileSync(path.join(SITE_ROOT, 'data', 'figures.json'), 'utf8');
  return JSON.parse(raw);
}

function writeFile(relPath, contents) {
  const full = path.join(DIST, relPath);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, contents);
  return full;
}

function main() {
  if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  const figuresRaw = loadFigures();
  const tokens = loadTokens(path.join(APP_ROOT, 'design', 'tokens.json'));

  writeFile('tokens.css', tokensToCss(tokens));
  writeFile('styles.css', readFileSync(path.join(SITE_ROOT, 'src', 'styles.css'), 'utf8'));

  const variants = {
    a: { label: 'the PIAAC 54%, with its explaining clause', opening: figuresRaw.variantA },
    b: { label: 'the plainer NCES 48%, no explaining needed', opening: figuresRaw.variantB },
  };

  for (const [key, v] of Object.entries(variants)) {
    const figures = { opening: v.opening, session: figuresRaw.session, mechanism: figuresRaw.mechanism };
    const html = renderPage({ label: v.label, figures, variantBanner: key.toUpperCase() });
    writeFile(`${key}/index.html`, html);
  }

  // A labelled, side-by-side compare page — the choice is Kihea's, so both
  // variants are built in full and neither is picked as the "real" index
  // (job 5). Each iframe loads the actual built page, not a duplicate copy,
  // so there is exactly one place either variant's markup lives.
  writeFile('index.html', compareHtml());

  console.log(`built ${Object.keys(variants).length} variant(s) + compare page into ${DIST}`);
}

function compareHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Superb — landing page, two openings</title>
<link rel="stylesheet" href="/tokens.css">
<style>
  html,body{margin:0;background:var(--site-ground);color:var(--site-ink);font-family:system-ui,sans-serif}
  header{padding:20px clamp(16px,3vw,40px);font-size:14px;color:var(--site-ink-muted)}
  header strong{color:var(--site-ink)}
  .cols{display:flex;height:calc(100vh - 64px)}
  .col{flex:1;display:flex;flex-direction:column;border-right:1px solid var(--site-metal-2)}
  .col:last-child{border-right:none}
  .col h2{margin:0;padding:12px clamp(16px,3vw,40px);font-size:14px;font-weight:600;background:rgba(255,255,255,.04)}
  .col iframe{flex:1;border:0;width:100%}
</style>
</head>
<body>
<header><strong>Two openings for "the case"</strong> — issue #89 asks which one leads. Not published; both fully built for review.</header>
<div class="cols">
  <div class="col">
    <h2>Variant A — 54% at PIAAC Level 2 or below, with its explaining clause</h2>
    <iframe src="/a/index.html" title="Variant A"></iframe>
  </div>
  <div class="col">
    <h2>Variant B — the plainer NCES 48%, no explaining needed</h2>
    <iframe src="/b/index.html" title="Variant B"></iframe>
  </div>
</div>
</body>
</html>
`;
}

main();
