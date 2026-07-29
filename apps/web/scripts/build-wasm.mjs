// Builds `superb-wasm` and binds it into this app -- the wiring
// ADVISORY-014 §1 named as M2's principal remaining track (docs/seams.md
// Seam 1: "the shell's view of the engine").
//
// Two outputs from one compiled artifact, because they run in two different
// hosts:
//   - `--target web`, into src/engine/wasm-pkg/ -- what the shipped app
//     actually imports (wasmEngine.ts). Vite resolves the generated
//     `new URL("superb_wasm_bg.wasm", import.meta.url)` call itself; no
//     bundler plugin is needed for wasm-bindgen's own "web" target.
//   - `--target nodejs`, into tests/wasm-node-pkg/ -- for the round-trip
//     test only (tests/engine-persistence.test.ts). Vitest runs under Node,
//     which cannot `fetch()` a same-origin wasm URL the way a browser can,
//     so the "web" output is not usable there; the "nodejs" target is
//     exactly what crates/superb-wasm's own Node golden tests already use
//     for the same reason.
//
// Both outputs are gitignored (apps/web/.gitignore) -- generated from
// crates/superb-wasm, rebuilt here the same way `sync-content.mjs` and
// `tokens-to-css.mjs` regenerate their own inputs before every dev/build/
// test run, not committed as a second copy of the crate's own output.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const wasmArtifact = join(
  repoRoot,
  "target",
  "wasm32-unknown-unknown",
  "release",
  "superb_wasm.wasm",
);
const webOutDir = join(here, "..", "src", "engine", "wasm-pkg");
const nodeOutDir = join(here, "..", "tests", "wasm-node-pkg");

function run(command, args, cwd) {
  console.log(`$ ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

run(
  "cargo",
  ["build", "-p", "superb-wasm", "--target", "wasm32-unknown-unknown", "--release", "--locked"],
  repoRoot,
);

for (const [target, outDir] of [
  ["web", webOutDir],
  ["nodejs", nodeOutDir],
]) {
  mkdirSync(outDir, { recursive: true });
  run("wasm-bindgen", ["--target", target, "--out-dir", outDir, wasmArtifact]);
}

if (!existsSync(join(webOutDir, "superb_wasm.js")) || !existsSync(join(nodeOutDir, "superb_wasm.js"))) {
  throw new Error("build-wasm.mjs: wasm-bindgen did not produce the expected output");
}

// wasm-bindgen's "nodejs" target emits CommonJS (require/module.exports).
// apps/web's own package.json declares "type": "module" for everything
// else in this app, which would make Node parse these .js files as ESM
// instead and fail on the bare `require` calls -- this package.json
// override is scoped to just this generated directory.
writeFileSync(join(nodeOutDir, "package.json"), JSON.stringify({ type: "commonjs" }, null, 2) + "\n");

console.log(`superb-wasm bound -> ${webOutDir} (web), ${nodeOutDir} (nodejs, tests only)`);
