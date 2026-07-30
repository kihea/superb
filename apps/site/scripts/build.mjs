#!/usr/bin/env node
// Builds the static site into dist/. No framework, no bundler — plain files,
// because there is nothing here that needs one (job 1). Never imports
// anything from apps/web.
//
// One page (ADR-038 Amendment 1). This used to build /a/, /b/ and a compare
// view while the opening statistic was still Kihea's open call on issue #89;
// he settled it ("true and accurate" was the criterion) and asked for a
// single page, so this file no longer knows what a variant is.

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

  const figures = loadFigures();
  const tokens = loadTokens(path.join(APP_ROOT, 'design', 'tokens.json'));

  writeFile('tokens.css', tokensToCss(tokens));
  writeFile('styles.css', readFileSync(path.join(SITE_ROOT, 'src', 'styles.css'), 'utf8'));
  writeFile('index.html', renderPage({ figures }));

  console.log(`built into ${DIST}`);
}

main();
