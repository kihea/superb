#!/usr/bin/env node
// The landing keeps Kihea's designed page as its visual source. The previous
// build generated a second page from data/figures.json; that machinery remains
// retired. Small shipping edits now live directly in page/: honest copy,
// working links, and a phone-safe header.
//
// This build copies page/ into dist/ and names the page index.html.
// page/ began as the drop from workspace/prototypes/landing-mockup on the
// private root.

import { cpSync, rmSync, renameSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, 'page');
const DIST = path.join(ROOT, 'dist');

rmSync(DIST, { recursive: true, force: true });
cpSync(PAGE, DIST, { recursive: true });

const dc = path.join(DIST, 'Superb Landing.dc.html');
if (!existsSync(dc)) {
  console.error('build: page/Superb Landing.dc.html missing — nothing to serve.');
  process.exit(1);
}
renameSync(dc, path.join(DIST, 'index.html'));
console.log('built into ' + DIST + ' (Kihea’s visual source, shipping edits included)');
