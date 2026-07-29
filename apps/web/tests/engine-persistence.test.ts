// M2 contract, item 2, read literally: "the frozen ADR-016 v1 fixture
// round-trips unchanged through the web shell's persistence." Not through
// superb-wasm's own Node tests (crates/superb-wasm/tests/golden.test.mjs
// already covers that -- item 1) -- through this app's own storage module,
// `src/storage/db.ts`, unmodified and imported directly, the same file
// useEngineSession.ts calls in the running app.
//
// `fake-indexeddb` stands in for the browser's IndexedDB so this can run
// under Node -- it is a polyfill of the same API `db.ts` calls, not a
// reimplementation of `db.ts` itself, so a bug in `db.ts`'s own
// transaction handling is still exactly as reachable here as it would be
// in a browser.
//
// Deliberately no `decide()` call anywhere in this file. "Round-trips
// unchanged" is a claim about the persistence path, not about a session
// never advancing a learner -- a real session is expected to; this test
// isolates load -> save -> put -> get from any session activity that would
// legitimately change the learner in between, which is exactly what
// crates/superb-wasm/tests/golden.test.mjs's own "initial_state round-trips
// through load/save" test already does at the wasm-boundary layer. This is
// that same claim, one layer up, through the real IndexedDB code path.
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { loadState, saveState } from "../src/storage/db";
// wasm-bindgen's "nodejs" target (scripts/build-wasm.mjs) -- see this
// directory's own package.json override for why a plain `import` works
// against its CommonJS output.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error -- generated output, no first-party types published for it here.
import { Engine } from "./wasm-node-pkg/superb_wasm.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "..", "..", "..", "crates", "superb-core", "tests", "fixtures", "learner_state_v1.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

describe("the frozen ADR-016 v1 fixture through the web shell's real persistence", () => {
  test("load -> save -> the shell's IndexedDB -> read back is byte-identical", async () => {
    const engine = new Engine();
    engine.load(JSON.stringify(fixture));
    const saved: string = engine.save();

    await saveState(saved);
    const reread = await loadState();

    expect(reread).toBe(saved);

    // And what came back still decodes to the same LearnerState the
    // fixture describes -- not just that the same string round-tripped,
    // but that the string is still what it claims to be.
    const reloaded = new Engine();
    reloaded.load(reread);
    const resaved = reloaded.save();
    const parsed = JSON.parse(resaved);
    expect(parsed.seed).toBe(fixture.seed);
    expect(parsed.draw_count).toBe(fixture.draw_count);
    expect(parsed.theta).toBeCloseTo(fixture.theta, 10);
    expect(parsed.words).toEqual(fixture.words);
    expect(parsed.topic_affinities).toEqual(fixture.topic_affinities);
  });

  test("a fresh install (no saved document) still round-trips through the same path", async () => {
    const engine = new Engine();
    engine.load(null);
    const fresh: string = engine.save();

    await saveState(fresh);
    expect(await loadState()).toBe(fresh);
  });
});
