// `wasm-bindgen`'s own generated `.d.ts` cannot express a discriminated
// union: every `load`/`save`/`plan`/`decide` parameter and return type it
// emits is `any` (see `../pkg/superb_wasm.d.ts` once built). `port.d.ts` is
// the hand-written file a caller should actually import instead.
//
// This test is what keeps the two from silently drifting apart on the one
// thing a script can check without a real TypeScript compiler: that
// `EnginePort`'s four method names appear on the generated `Engine` class
// with the same number of parameters. Whether `port.d.ts`'s *types* still
// match `docs/seams.md` is a human review, the same as any other change to
// a frozen seam — this test cannot see a type, only a signature's shape.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const generatedDtsPath = path.join(here, "..", "pkg", "superb_wasm.d.ts");
const handWrittenDtsPath = path.join(here, "..", "port.d.ts");

/** Every `name(...)` signature's parameter count, read out of a TypeScript
 * class or interface body with a regex rather than a real parser — good
 * enough to catch a method renamed, dropped, or given a different arity,
 * which is the failure this test exists to catch. */
function methodArities(source) {
  const arities = new Map();
  // Matches `name(a, b): T;` or `name(a: X, b?: Y): T {` — stops at the
  // first top-level `)`, so a param whose own type contains `(` or `)`
  // (none of EnginePort's do) would need a smarter scan than this.
  const pattern = /^\s*(\w+)\(([^)]*)\)\s*:/gm;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const [, name, params] = match;
    const arity = params.trim() === "" ? 0 : params.split(",").length;
    arities.set(name, arity);
  }
  return arities;
}

test("the generated Engine class carries every EnginePort method at the same arity as port.d.ts", () => {
  const generated = methodArities(readFileSync(generatedDtsPath, "utf8"));
  const handWritten = methodArities(readFileSync(handWrittenDtsPath, "utf8"));

  for (const name of ["load", "save", "plan", "decide"]) {
    assert.ok(handWritten.has(name), `port.d.ts's EnginePort has no ${name}(...) — this test's own regex may be stale`);
    assert.ok(generated.has(name), `generated superb_wasm.d.ts has no ${name}(...) on Engine`);
    assert.equal(
      generated.get(name),
      handWritten.get(name),
      `${name}: generated Engine takes ${generated.get(name)} params, port.d.ts's EnginePort takes ${handWritten.get(name)}`
    );
  }
});
