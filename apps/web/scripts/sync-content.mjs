// Bundles content/passages/*.json and content/sources/*.json (owned by T3, one
// level up from this repo's apps/) into two arrays this app can fetch as
// static assets. Read-only against content/ -- never writes there.
//
// Regenerated before every dev server start and every build; its output
// (public/content/) is gitignored so there is exactly one copy of the
// content on disk that anyone has to keep in sync.
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const contentRoot = join(here, "..", "..", "..", "content");
const outDir = join(here, "..", "public", "content");

function loadJsonDir(sub) {
  const dir = join(contentRoot, sub);
  const rows = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".json")) continue; // skips _seed.py
    rows.push(JSON.parse(readFileSync(join(dir, name), "utf-8")));
  }
  return rows;
}

const passages = loadJsonDir("passages");
const sources = loadJsonDir("sources");

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "passages.json"), JSON.stringify(passages));
writeFileSync(join(outDir, "sources.json"), JSON.stringify(sources));

console.log(
  `synced ${passages.length} passages, ${sources.length} sources -> public/content/`,
);
