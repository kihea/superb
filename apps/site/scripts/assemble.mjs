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
import { fileURLToPath, pathToFileURL } from 'node:url';

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

  // Issue #126: the file-content scanner that used to be the only line of
  // defence here cannot see what a payload does once something fetches and
  // runs it, only what a filename or a text-readable file's bytes claim to
  // be -- three rounds of making it read more (a filename, then exact
  // bytes, then more file types) were each defeated by disguising the
  // payload as a type the scanner still does not read (an image can carry
  // arbitrary bytes; nothing stops a script it does not suspect from
  // fetching and running them). A Content-Security-Policy is the boundary
  // that actually holds: the browser refuses the network request itself,
  // at the moment it is made, regardless of what the requesting code was
  // named, claimed to be, or how the address it used was assembled. Written
  // here, not committed as a static file, for the same reason the
  // apps/web-standalone case above isn't: this is the one place that knows
  // both surfaces' real subpaths.
  //
  // Landing (`/`) needs `'unsafe-eval'` in script-src -- audited, not
  // assumed: apps/site/page/support.js (the owner-supplied `dc-runtime`)
  // runs Babel-transformed JSX via `new Function(...)` at runtime, which
  // CSP treats identically to `eval()`. Removing that would mean rewriting
  // the owner-authored runtime rather than fixing an egress hole, which is
  // a different and much larger piece of work than this issue asks for.
  // `'unsafe-eval'` does not reopen the hole this policy exists to close --
  // it only permits *how* already-loaded, already-origin-restricted code
  // may execute, never *which host* it may reach; connect-src/script-src's
  // host allow-list is what actually blocks the attack this issue
  // describes (a same-origin file loading a disguised payload that then
  // reaches an outside server), and that restriction holds whether or not
  // eval is permitted. Every host below was found by loading both pages in
  // a real browser and recording every request actually made
  // (`node audit-requests-tmp.mjs`, not kept -- see the PR body), not
  // copied from the file-scanner's own allow-list on faith.
  //
  // `/read/*` needs `'wasm-unsafe-eval'` (CSP's own narrower permission for
  // WebAssembly.instantiate, not the general `eval()`/`Function()` grant
  // `'unsafe-eval'` gives) for the engine, and `'unsafe-inline'` in
  // style-src for React's own `style={{...}}` prop, which several
  // components use (a DOM style *attribute*, not a `<script>` -- a much
  // narrower, commonly-accepted allowance than inline script would be).
  // Neither page needs `connect-src`/`script-src` to reach any third host
  // beyond what is named below -- the reading app is fully self-contained
  // (real content, the wasm engine, IndexedDB, the Cache API, no network
  // calls off-origin at all).
  const LANDING_CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' https://unpkg.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self'",
    "img-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  const APP_CSP = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    "img-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  // Exact-path `/` and prefix `/read/*` deliberately never overlap -- each
  // request matches exactly one rule, so there is never a question of which
  // of two Content-Security-Policy header values Cloudflare Pages would
  // send (per-directive merge across matching blocks is real but not
  // something a routing config should ever have to rely on getting right).
  writeFileSync(
    path.join(SITE_DIST, '_headers'),
    `/
  Content-Security-Policy: ${LANDING_CSP}

${APP_BASE}*
  Content-Security-Policy: ${APP_CSP}
`,
  );

  console.log(`assembled -> ${SITE_DIST} (landing at /, app at ${APP_BASE})`);
}

// Guarded, not a bare call: check-assembled.mjs imports this module for its
// `APP_BASE` constant alone (so the two files cannot name the app's subpath
// two different ways), and that import must never trigger a full rebuild --
// this script's own contract is "reads dist/ as it is, does not build
// anything". pathToFileURL, not a manual string join: a manual "file://" +
// path join is wrong on Windows, where an absolute path already starts with
// a drive letter and needs a third slash (file:///C:/...) that string
// concatenation does not add.
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
