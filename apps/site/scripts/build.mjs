#!/usr/bin/env node
// The landing page is Kihea's own designed page, served verbatim — his
// direction of 2026-07-31: "ensure it's literally just copied over." The
// previous build generated a rebuilt page from data/figures.json; that
// machinery is retired with it (see git history at this branch's base for
// the generator, its device checks, and its phrase lint).
//
// This build copies page/ into dist/ and names the page index.html.
// page/ is the drop from workspace/prototypes/landing-mockup on the
// private root, unedited.
//
// DECISION PENDING: https://github.com/kihea/superb/issues/114#issuecomment-5149901889
// The truthful-alpha checkpoint (PLAN.md §7) asks for the landing page's
// primary CTA to point at /read/ and for dead href="#" navigation to be
// removed. page/Superb Landing.dc.html has six such links today (the nav
// and both hero buttons) and none of them go anywhere. Left untouched here
// on purpose -- that would contradict "literally just copied over" above --
// pending Kihea's call on whether this build step should patch just those
// hrefs mechanically at assembly time, or something else.

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
console.log('built into ' + DIST + ' (Kihea’s page, copied verbatim)');
