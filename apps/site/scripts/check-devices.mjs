#!/usr/bin/env node
// T9 job 4: "add a check that fails if the rendered count and the cited
// figure disagree — watched red before it is trusted."
//
// This reads the BUILT html in dist/ (not the generator's internal state,
// not data/figures.json's own claims about itself) and independently counts
// how many cells actually carry `cell--filled` versus the total cell count,
// for every device tagged data-figure-kind="measured". A generator bug that
// silently drew the wrong number of squares is exactly what this is for.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, '..');
const DIST = path.join(SITE_ROOT, 'dist');

function loadFigures() {
  const raw = readFileSync(path.join(SITE_ROOT, 'data', 'figures.json'), 'utf8');
  return JSON.parse(raw);
}

// Pull out the `device__grid` cell block that belongs to a specific
// data-figure-id, wherever it appears in the page.
function extractGrid(html, figureId) {
  const marker = `data-figure-id="${figureId}"`;
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) return null;
  const gridStart = html.indexOf('<div class="device__grid">', markerIdx);
  if (gridStart === -1) return null;
  const contentStart = gridStart + '<div class="device__grid">'.length;
  const gridEnd = html.indexOf('</div>', contentStart);
  if (gridEnd === -1) return null;
  return html.slice(contentStart, gridEnd);
}

function countCells(gridHtml) {
  const total = (gridHtml.match(/<span class="cell/g) || []).length;
  const filled = (gridHtml.match(/cell--filled/g) || []).length;
  return { total, filled };
}

function checkFigureIn(pageFile, figure) {
  if (!existsSync(pageFile)) {
    return { ok: false, message: `${pageFile} does not exist — run npm run build first` };
  }
  const html = readFileSync(pageFile, 'utf8');
  const grid = extractGrid(html, figure.id);
  if (!grid) {
    return { ok: false, message: `figure "${figure.id}" (${figure.value}/${figure.total}) has no device__grid in ${path.basename(pageFile)}` };
  }
  const rendered = countCells(grid);
  const ok = rendered.total === figure.total && rendered.filled === figure.value;
  return {
    ok,
    message: ok
      ? `OK  ${figure.id}: cited ${figure.value}/${figure.total} == rendered ${rendered.filled}/${rendered.total} (${path.basename(path.dirname(pageFile))}/)`
      : `RED ${figure.id}: cited ${figure.value}/${figure.total} != rendered ${rendered.filled}/${rendered.total} (${path.basename(path.dirname(pageFile))}/)`,
  };
}

function main() {
  const figures = loadFigures();
  const checks = [
    { figure: figures.variantA, file: path.join(DIST, 'a', 'index.html') },
    { figure: figures.variantB, file: path.join(DIST, 'b', 'index.html') },
    { figure: figures.session, file: path.join(DIST, 'a', 'index.html') },
    { figure: figures.session, file: path.join(DIST, 'b', 'index.html') },
  ];

  let failed = false;
  for (const { figure, file } of checks) {
    const result = checkFigureIn(file, figure);
    console.log(result.message);
    if (!result.ok) failed = true;
  }

  // The mechanism device carries no figure by design (ADR-038 Decision 4) —
  // confirmed by absence, not skipped silently: fail loudly if a number ever
  // creeps back in under that id.
  for (const file of [path.join(DIST, 'a', 'index.html'), path.join(DIST, 'b', 'index.html')]) {
    if (!existsSync(file)) continue;
    const html = readFileSync(file, 'utf8');
    const marker = `data-figure-id="${figures.mechanism.id}"`;
    const idx = html.indexOf(marker);
    if (idx !== -1) {
      const tagStart = html.lastIndexOf('<div', idx);
      const tagEnd = html.indexOf('>', idx);
      const openTag = html.slice(tagStart, tagEnd + 1);
      if (!openTag.includes('data-figure-kind="mechanism"')) {
        console.log(`RED ${figures.mechanism.id}: expected kind="mechanism" (no number), found something else in ${path.basename(path.dirname(file))}/`);
        failed = true;
      } else {
        console.log(`OK  ${figures.mechanism.id}: mechanism device carries no figure (${path.basename(path.dirname(file))}/)`);
      }
    }
  }

  if (failed) {
    console.error('\ncheck-devices: FAILED — a rendered device disagrees with its cited figure.');
    process.exit(1);
  }
  console.log('\ncheck-devices: all devices match their cited figures.');
}

main();
