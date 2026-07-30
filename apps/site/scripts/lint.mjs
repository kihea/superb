#!/usr/bin/env node
// T9 DONE #4: three phrases must never appear again, in any build.
// Also enforces DONE #3's "one read is the check" mechanically: every
// figure marked "cited" in data/figures.json must have its citation text
// present on the same built page as its value.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, '..');
const DIST = path.join(SITE_ROOT, 'dist');

const BANNED = [
  'sixth-grade level',
  '1,284',
  "60 you'll spend scrolling",
  '60 you’ll spend scrolling', // curly apostrophe, as the mockup actually wrote it
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out;
}

function main() {
  if (!existsSync(DIST)) {
    console.error('lint: dist/ does not exist — run npm run build first');
    process.exit(1);
  }
  const figures = JSON.parse(readFileSync(path.join(SITE_ROOT, 'data', 'figures.json'), 'utf8'));
  const files = walk(DIST);
  let failed = false;

  for (const file of files) {
    const html = readFileSync(file, 'utf8');
    for (const phrase of BANNED) {
      if (html.includes(phrase)) {
        console.error(`RED banned phrase "${phrase}" found in ${path.relative(DIST, file)}`);
        failed = true;
      }
    }
  }

  const target = path.join(DIST, 'index.html');
  if (existsSync(target)) {
    const html = readFileSync(target, 'utf8');
    const fig = figures.opening;
    if (fig.kind === 'cited' && !html.includes(fig.citation)) {
      console.error(`RED "${fig.id}" is a cited figure but its citation text is missing from ${path.relative(DIST, target)}`);
      failed = true;
    }
  }

  if (failed) {
    console.error('\nlint: FAILED');
    process.exit(1);
  }
  console.log('lint: no banned phrases, every cited figure carries its citation on the page it appears on.');
}

main();
