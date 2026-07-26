// The wire shape `crates/superb-wasm` actually produces, hand-written
// because `wasm-bindgen`'s own generated `.d.ts` cannot express a
// discriminated union — every `load`/`save`/`plan`/`decide` parameter and
// return type it emits is `any`. This file is what a TypeScript caller
// should import instead.
//
// `docs/seams.md` §Seam 1, as amended twice on 2026-07-25 ("the seam
// catches up with ADR-022"), is this file's source of truth.
// `Needs.PassageTopics`, `Frame.Topics`, `Effect.TopicAffinityUpdated`, and
// `topics` on both `Candidate` and `Passage` are that amendment, not an
// extension past it: docs/seams.md froze before ADR-022 landed and was
// missing every one of them. The second pass (adding `Candidate.topics`/
// `Passage.topics`) followed evidence that omitting them left ADR-022's
// composer-side scoring (`taste_multiplier`) permanently inert on web with
// every test green — silently inert while looking installed, not a new
// decision made here.
//
// **`TopicAffinityUpdated` crosses this boundary and must never be
// rendered.** It is in the stream because filtering it out inside the
// binding would be the binding deciding what the host may know — the exact
// boundary violation the seam exists to prevent. `finished`/`abandoned` are
// counts of the reader's own behaviour; a screen that shows them is the app
// telling the reader what it noticed about them (law 3). Persist it, do
// nothing else with it: no display, no "you've been enjoying…", no topic
// chips, no Settings readout, no debug overlay that survives to production.
//
// `tests/port-dts.test.mjs` is what keeps this file and the generated one
// from silently drifting apart on method names and arity; keeping this
// file's *types* aligned with `docs/seams.md` is a human review, the same
// as any other change to a frozen seam.

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
  // ADR-022 (docs/seams.md's 2026-07-25 amendment): what a PassageFinished
  // or PassageAbandoned's passage was about, looked up rather than carried
  // on the event so a mislabelled host can't corrupt durable state.
  | { kind: "PassageTopics"; passage: string };

export type Frame =
  | { kind: "Nothing" }
  | { kind: "ItemDifficulty"; difficulty: number }
  | { kind: "Content"; content: ContentFrame }
  // ADR-022. Empty is legal — an unlabelled passage teaches the engine
  // nothing about taste, and is not made to.
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
  // ADR-022 — see this file's header comment. taste_multiplier's real
  // scoring reads this; a host that can't supply it leaves ADR-022 inert.
  topics: string[];
}

export type Effect =
  | { kind: "WordStateChanged"; word: string; from: string; to: string }
  | { kind: "IntervalSet"; word: string; due: number }
  | { kind: "ThetaUpdated"; theta: number; se: number }
  | { kind: "ProbeEligible"; word: string }
  | { kind: "ContextFrameLogged"; word: string; frameId: string }
  | { kind: "PassageComposed"; passage: Passage }
  // ADR-022. A topic's tally moved. NEVER RENDERED — see this file's header
  // comment.
  | { kind: "TopicAffinityUpdated"; topic: string; finished: number; abandoned: number };

export interface Passage {
  id: string;
  pool: Pool;
  fills: { index: number; word: string }[];
  targets: string[];
  seeded: string[];
  // ADR-022 — see this file's header comment. Carried through only because
  // superb-core's own Passage already has it; nothing on the host side
  // reads this back.
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
