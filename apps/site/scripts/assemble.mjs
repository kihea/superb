#!/usr/bin/env node
// T10 job 1: one deployable, two surfaces -- the landing at "/" and the
// reading app at "/read/", built from one job rather than two Pages
// projects with cross-project routing (that decision is already made in
// the track file; this script just carries it out).
//
// Each app keeps its own build -- apps/site never learns apps/web's
// toolchain, and this script does not either, beyond running `npm run
// build` in each app's own directory (dependencies for both are assumed
// already installed; the workflow's own steps do that, the same way
// web.yml already does for apps/web on its own).
//
// The subpath is the one constant Job 1 asks for: APP_BASE below, passed
// through as VITE_BASE so apps/web/vite.config.ts's own BASE constant
// (which src/content/store.ts also reads back at runtime) is the only
// other place it is spelled out. Change it here to move where the app
// lives; nothing else needs to know.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, '..');
const APPS_ROOT = path.resolve(SITE_ROOT, '..');
const WEB_ROOT = path.join(APPS_ROOT, 'web');
const SITE_DIST = path.join(SITE_ROOT, 'dist');
const WEB_DIST = path.join(WEB_ROOT, 'dist');

export const APP_BASE = '/read/';

// Windows resolves `npm` through a .cmd shim, which execFileSync can only
// launch through a shell -- `npm.cmd` directly is not reliably on PATH the
// same way across every shell this runs in (verified: it 404s under Git
// Bash here). shell:true is what makes that shim launch on every platform
// CI and a contributor's machine actually use; the argv (fixed strings this
// script owns, never user input) is safe to pass that way.
function run(command, args, cwd, extraEnv) {
  console.log(`$ (${path.relative(APPS_ROOT, cwd)}) ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
    shell: true,
  });
}

function main() {
  // Landing first -- it owns dist/'s root and this rebuild wipes whatever
  // was there (scripts/build.mjs's own behaviour, unchanged).
  run('npm', ['run', 'build'], SITE_ROOT);

  run('npm', ['run', 'build'], WEB_ROOT, { VITE_BASE: APP_BASE });

  const target = path.join(SITE_DIST, 'read');
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  cpSync(WEB_DIST, target, { recursive: true });

  // apps/web ships its own _redirects for when it stands alone at "/";
  // Cloudflare Pages only reads the file at the artifact's root, so the
  // copy under read/ is dead there. The live rule is written at the root:
  // every /read/ route is the app's one document (a 200 rewrite, so the
  // address bar keeps the deep path). The landing's own files are real and
  // need no rule.
  rmSync(path.join(target, '_redirects'), { force: true });
  writeFileSync(
    path.join(SITE_DIST, '_redirects'),
    `${APP_BASE}*    ${APP_BASE}index.html    200
`,
  );

  console.log(`assembled -> ${SITE_DIST} (landing at /, app at ${APP_BASE})`);
}

main();
