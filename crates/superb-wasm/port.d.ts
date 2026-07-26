// The wire shape `crates/superb-wasm` actually produces, hand-written
// because `wasm-bindgen`'s own generated `.d.ts` cannot express a
// discriminated union — every `load`/`save`/`plan`/`decide` parameter and
// return type it emits is `any`. This file is what a TypeScript caller
// should import instead.
//
// `docs/seams.md` §Seam 1 is this file's source of truth: everything below
// the "--- ADR-022 ---" marker is real wire shape this crate emits and
// accepts, but is not yet reflected in that document (it predates ADR-022's
// topic-affinity update). DECISION PENDING:
// https://github.com/kihea/superb/issues/28 -- whether docs/seams.md should
// fold these in. `tests/port-dts.test.mjs` is what keeps this file and the
// generated one from silently drifting apart on method names and arity;
// keeping this file's *types* aligned with `docs/seams.md` is a human
// review, the same as any other change to a frozen seam.

export type Pool = "Composed" | "Sourced";

export type Request =
  | { kind: "ProcessEvent"; event: Event }
  | { kind: "NextPassage" };

export type Event =
  | { kind: "DeckSwipe"; itemId: string; isPseudoword: boolean; knew: boolean }
  | { kind: "GlossTap"; word: string; passage: string; position: number }
  | { kind: "ProbeResult"; word: string; assembled: boolean; attempts: number }
  | { kind: "ScreenDwell"; screen: string; words: string[]; ms: number }
  | { kind: "PassageFinished"; passage: string; wordsSeen: string[] }
  | { kind: "PassageAbandoned"; passage: string; wordsSeen: string[] };

export type Needs =
  | { kind: "Nothing" }
  | { kind: "ItemDifficulty"; itemId: string }
  | { kind: "PassageCandidates"; dueWords: string[]; bandLow: number; bandHigh: number }
  // --- ADR-022 ---
  | { kind: "PassageTopics"; passage: string };

export type Frame =
  | { kind: "Nothing" }
  | { kind: "ItemDifficulty"; difficulty: number }
  | { kind: "Content"; content: ContentFrame }
  // --- ADR-022 ---
  | { kind: "Topics"; topics: string[] };

export interface ContentFrame {
  candidates: Candidate[];
  wordClasses: Record<string, string[]>;
  bandWords: string[];
}

export interface Candidate {
  id: string;
  pool: Pool;
  slots: { index: number; class: string; defaultWord: string }[];
  words: string[];
  // --- ADR-022 --- what this passage is about; may be empty.
  topics: string[];
}

export type Effect =
  | { kind: "WordStateChanged"; word: string; from: string; to: string }
  | { kind: "IntervalSet"; word: string; due: number }
  | { kind: "ThetaUpdated"; theta: number; se: number }
  | { kind: "ProbeEligible"; word: string }
  | { kind: "ContextFrameLogged"; word: string; frameId: string }
  | { kind: "PassageComposed"; passage: Passage }
  // --- ADR-022 ---
  | { kind: "TopicAffinityUpdated"; topic: string; finished: number; abandoned: number };

export interface Passage {
  id: string;
  pool: Pool;
  fills: { index: number; word: string }[];
  targets: string[];
  seeded: string[];
  // --- ADR-022 --- carried through from the winning candidate.
  topics: string[];
}

/** `crates/superb-wasm`'s generated `Engine` class already implements this
 * shape at the JS runtime level; only its `.d.ts` cannot say so, because
 * `wasm-bindgen` types every `JsValue` parameter and return as `any`. */
export interface EnginePort {
  load(document: string | null): void;
  save(): string;
  plan(request: Request, nowMs: number): Needs;
  decide(request: Request, frame: Frame, nowMs: number): Effect[];
}
