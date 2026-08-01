// Issue #132: a component that reaches past the semantic colour tokens
// (--text-1, --brand, --surface-page, ...) to one theme's raw values
// (--ox-*, --li-*, --gl-*) silently pins that theme -- it paints correctly
// only until someone opens the app in one of the other two. This happened
// once already: the shared Cover component set its ink from Oxblood's raw
// values, so a book cover under Lilac or Glacier still painted Oxblood's
// ink onto a violet or teal card. It was caught by hand-grepping during a
// design pass. This script is that grep, running on every pull request
// instead of when someone happens to look.
//
// Two files legitimately need the raw values, named here rather than left
// as a pattern nobody can trace back to a reason:
//
//   - src/design/ox.css defines the three themes' raw values in the first
//     place; there is nothing for it to alias.
//   - src/screens/Settings.css paints its three theme-swatch previews
//     (.settings-swatch--oxblood/lilac/glacier) so a reader can see what
//     Lilac and Glacier look like while a different theme is active. The
//     semantic aliases resolve to the *active* theme, so using them here
//     would make all three swatches look like whichever one is already
//     showing -- raw values are the entire point of this file.
//
// Three screens are skipped by exact path rather than folded into the
// exceptions above: SignIn.css, Share.css and Challenge.css hold raw
// references today because those screens are still placeholders backed by
// fake (v0mock) data and are due to be rewritten. An exception nobody has
// to remove tends to outlive its reason, so these are named individually
// -- delete each line the day its screen is rewritten for real, not before.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_ROOT = fileURLToPath(new URL("../src", import.meta.url));
const SCANNED_EXTENSIONS = new Set([".css", ".ts", ".tsx"]);
// Whitespace-tolerant and matched against the whole file (not per line):
// `var( --ox-ink)` and a reference split across lines both resolve to the
// same raw value as the contiguous form and are just as invisible to a
// reader, so the pattern -- and the scan -- has to tolerate both.
const RAW_TOKEN_PATTERN = /var\s*\(\s*--(?:ox|li|gl)-/g;

const ALLOWED_PATHS = new Set([
  // Defines the raw values every other file is supposed to alias away from.
  "design/ox.css",
  // Theme-swatch previews must show Lilac/Glacier while another theme is
  // active; the semantic alias would resolve to the active theme instead.
  "screens/Settings.css",
  // Placeholder screens, still backed by fake (v0mock) data, awaiting a
  // real rewrite -- delete each line the day its screen is rewritten.
  "screens/SignIn.css",
  "screens/Share.css",
  "screens/Challenge.css",
]);

function collectFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const info = statSync(path);
    if (info.isDirectory()) {
      files.push(...collectFiles(path));
      continue;
    }
    if (SCANNED_EXTENSIONS.has(entry.slice(entry.lastIndexOf(".")))) {
      files.push(path);
    }
  }
  return files;
}

const violations = [];
for (const path of collectFiles(SRC_ROOT)) {
  const relativePath = relative(SRC_ROOT, path).split("\\").join("/");
  if (ALLOWED_PATHS.has(relativePath)) {
    continue;
  }
  const text = readFileSync(path, "utf-8");
  for (const match of text.matchAll(RAW_TOKEN_PATTERN)) {
    const line = text.slice(0, match.index).split("\n").length;
    const snippet = match[0].replace(/\s+/g, " ");
    violations.push(`src/${relativePath}:${line}: ${snippet} -- use a semantic token instead`);
  }
}

if (violations.length > 0) {
  console.error(`theme-token guard FAILED (${violations.length}):`);
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  console.error(
    "\nRaw theme values (--ox-*, --li-*, --gl-*) pin one theme. Read the " +
      "semantic name instead (--text-1, --brand, --surface-page, ...), or " +
      "add a named, reasoned exception in check-theme-tokens.mjs.",
  );
  process.exit(1);
}
console.log("theme-token guard passed: no component reaches past the semantic tokens.");
