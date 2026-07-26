// The test the track exists to pass: drive superb-core's own frozen golden
// vectors through the *compiled wasm binding*, not through Rust, and assert
// the effect stream it produces means the same thing the vector pins.
//
// "Byte-identical" cannot mean literal bytes here — the whole point of
// `src/wire.rs` is that the wire shape is not superb-core's own JSON shape.
// What this asserts instead: translate the fixture's native-Rust-shaped
// event/frame into the wire shape by hand (mirroring `wire.rs`'s own
// conversions, deliberately re-derived rather than imported, so a bug in one
// side's translation cannot cancel out against the same bug in the other),
// call the real `Engine` through the real compiled `.wasm`, translate the
// fixture's expected effects the same way, and deep-equal the two. A
// mismatch here means the wasm boundary reinterpreted something the Rust
// side never did.
//
// Run after `cargo build -p superb-wasm --target wasm32-unknown-unknown
// --release` and `wasm-bindgen --target nodejs --out-dir pkg ...` have
// produced `../pkg/superb_wasm.js` — see `.github/workflows/wasm.yml`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const goldenDir = path.join(here, "..", "..", "superb-core", "tests", "golden");
const pkgPath = path.join(here, "..", "pkg", "superb_wasm.js");

const { Engine } = await import(pathToFileURL(pkgPath).href);

function nativeEventToWire(event) {
  const [tag, payload] = Object.entries(event)[0];
  switch (tag) {
    case "DECK_SWIPE":
      return { kind: "DeckSwipe", itemId: payload.item_id, isPseudoword: payload.is_pseudoword, knew: payload.knew };
    case "GLOSS_TAP":
      return { kind: "GlossTap", word: payload.word, passage: payload.passage, position: payload.position };
    case "PROBE_RESULT":
      return { kind: "ProbeResult", word: payload.word, assembled: payload.assembled, attempts: payload.attempts };
    case "SCREEN_DWELL":
      return { kind: "ScreenDwell", screen: payload.screen_id, words: payload.words_on_screen, ms: payload.ms };
    case "PASSAGE_FINISHED":
      return { kind: "PassageFinished", passage: payload.passage, wordsSeen: payload.words_seen };
    case "PASSAGE_ABANDONED":
      return { kind: "PassageAbandoned", passage: payload.passage, wordsSeen: payload.words_seen };
    default:
      throw new Error(`golden.test.mjs: unknown native Event tag ${tag}`);
  }
}

function nativeFrameToWire(frame) {
  if (frame === "Nothing") return { kind: "Nothing" };
  const [tag, payload] = Object.entries(frame)[0];
  switch (tag) {
    case "ItemDifficulty":
      return { kind: "ItemDifficulty", difficulty: payload.difficulty };
    case "Content":
      return { kind: "Content", content: nativeContentFrameToWire(payload) };
    case "Topics":
      return { kind: "Topics", topics: payload.topics };
    default:
      throw new Error(`golden.test.mjs: unknown native Frame tag ${tag}`);
  }
}

function nativeContentFrameToWire(content) {
  return {
    candidates: content.candidates.map((candidate) => ({
      id: candidate.id,
      pool: candidate.pool,
      slots: candidate.slots.map((slot) => ({ index: slot.index, class: slot.class, defaultWord: slot.default_word })),
      words: candidate.words,
      topics: candidate.topics,
    })),
    wordClasses: content.word_classes,
    bandWords: content.band_words,
  };
}

function nativePassageToWire(passage) {
  return {
    id: passage.id,
    pool: passage.pool,
    topics: passage.topics,
    fills: passage.fills.map((fill) => ({ index: fill.index, word: fill.word })),
    targets: passage.targets,
    seeded: passage.seeded,
  };
}

function nativeEffectToWire(effect) {
  const [tag, payload] = Object.entries(effect)[0];
  switch (tag) {
    case "WordStateChanged":
      return { kind: "WordStateChanged", word: payload.word, from: payload.from, to: payload.to };
    case "IntervalSet":
      return { kind: "IntervalSet", word: payload.word, due: payload.due };
    case "ThetaUpdated":
      return { kind: "ThetaUpdated", theta: payload.theta, se: payload.se };
    case "ProbeEligible":
      return { kind: "ProbeEligible", word: payload.word };
    case "ContextFrameLogged":
      return { kind: "ContextFrameLogged", word: payload.word, frameId: payload.frame_id };
    case "PassageComposed":
      return { kind: "PassageComposed", passage: nativePassageToWire(payload.passage) };
    case "TopicAffinityUpdated":
      return { kind: "TopicAffinityUpdated", topic: payload.topic, finished: payload.finished, abandoned: payload.abandoned };
    default:
      throw new Error(`golden.test.mjs: unknown native Effect tag ${tag}`);
  }
}

const goldenFiles = readdirSync(goldenDir).filter((name) => name.endsWith(".jsonl")).sort();
assert.ok(goldenFiles.length > 0, `no .jsonl vectors found under ${goldenDir}`);

for (const file of goldenFiles) {
  test(`golden vector replays through the wasm boundary: ${file}`, () => {
    const lines = readFileSync(path.join(goldenDir, file), "utf8").trim().split("\n");
    const header = JSON.parse(lines[0]);
    const expectedEffects = lines.slice(1).map((line) => nativeEffectToWire(JSON.parse(line)));

    const engine = new Engine();
    const document = JSON.stringify({ v: 1, ...header.initial_state });
    engine.load(document);

    const wireRequest = { kind: "ProcessEvent", event: nativeEventToWire(header.event) };
    const wireFrame = nativeFrameToWire(header.frame);

    const actualEffects = engine.decide(wireRequest, wireFrame, header.now);

    assert.deepStrictEqual(actualEffects, expectedEffects, `${file}: wasm effect stream does not match the fixture`);
  });
}

test("load(null) then save() produces a valid v1 envelope", () => {
  const engine = new Engine();
  engine.load(null);
  const document = JSON.parse(engine.save());
  assert.equal(document.v, 1);
  assert.equal(typeof document._note, "string");
  assert.equal(document.seed, 0);
  assert.equal(document.draw_count, 0);
  assert.equal(document.theta, 0);
  assert.deepStrictEqual(document.words, {});
  assert.deepStrictEqual(document.topic_affinities, {});
});

test("save -> load -> save is stable", () => {
  const engine = new Engine();
  engine.load(null);
  const first = engine.save();

  const reloaded = new Engine();
  reloaded.load(first);
  const second = reloaded.save();

  assert.equal(first, second);
});

test("a real golden fixture's initial_state round-trips through load/save", () => {
  const fixture = JSON.parse(readFileSync(path.join(here, "..", "..", "superb-core", "tests", "fixtures", "learner_state_v1.json"), "utf8"));
  const engine = new Engine();
  engine.load(JSON.stringify(fixture));
  const saved = JSON.parse(engine.save());
  assert.equal(saved.seed, fixture.seed);
  assert.equal(saved.draw_count, fixture.draw_count);
  assert.deepStrictEqual(saved.words, fixture.words);
  assert.deepStrictEqual(saved.topic_affinities, fixture.topic_affinities);
});

test("malformed input to load throws a catchable Error rather than panicking", () => {
  const engine = new Engine();
  assert.throws(() => engine.load("not json"), /superb-wasm: load failed/);
  // The instance must still work after a rejected load — a panic would have
  // poisoned it; a thrown Error must not.
  engine.load(null);
  assert.equal(typeof engine.save(), "string");
});

test("plan for NextPassage on a learner with nothing due asks for candidates in a zero-width band", () => {
  const engine = new Engine();
  engine.load(null);
  const needs = engine.plan({ kind: "NextPassage" }, 0);
  assert.equal(needs.kind, "PassageCandidates");
  assert.deepStrictEqual(needs.dueWords, []);
});
