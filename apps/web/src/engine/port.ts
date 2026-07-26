// Copied verbatim from docs/seams.md §"Seam 1 -- the shell's view of the
// engine", including both same-day amendments (ADR-022's three enum
// members, then the topics fields on Candidate and Passage the first
// amendment missed). Frozen. If this drifts from the seam, the seam is
// what's right -- fix this file, not the other way around.

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

/** What the core needs fetched before it can decide. The shell answers this
 *  from its content store and hands the answer straight back. It does not
 *  filter, rank, or interpret -- those are decisions. */
export type Needs =
  | { kind: "Nothing" }
  | { kind: "ItemDifficulty"; itemId: string }
  | { kind: "PassageCandidates"; dueWords: string[]; bandLow: number; bandHigh: number }
  /** ADR-022. A PassageFinished or PassageAbandoned needs to know what the
   *  passage was about. The topics are looked up rather than carried on the
   *  event, so a host that mislabels a passage cannot corrupt durable state. */
  | { kind: "PassageTopics"; passage: string };

export type Frame =
  | { kind: "Nothing" }
  | { kind: "ItemDifficulty"; difficulty: number }
  | { kind: "Content"; content: ContentFrame }
  /** Empty is legal -- an unlabelled passage teaches the engine nothing about
   *  taste, and is not made to. */
  | { kind: "Topics"; topics: string[] };

export interface ContentFrame {
  candidates: Candidate[];
  /** word -> the slot classes it may fill. Straight from the lexicon. */
  wordClasses: Record<string, string[]>;
  /** Unmet words inside the θ band, best first. The shell's ranking is a
   *  corpus property (frequency, how informative the contexts are); which of
   *  them are actually used, and how many, is the engine's call. */
  bandWords: string[];
}

export interface Candidate {
  id: string;
  pool: Pool;
  /** Composed only. */
  slots: { index: number; class: string; defaultWord: string }[];
  /** Sourced only: words the excerpt carries in informative context. */
  words: string[];
  /** ADR-022. What this passage is about -- opaque ids from the content
   *  pipeline. The engine never interprets them, only counts what the reader
   *  did with them. Empty is legal and is not penalised -- but see the note
   *  below, because empty is also how this feature fails silently. */
  topics: string[];
}

export type Effect =
  | { kind: "WordStateChanged"; word: string; from: string; to: string }
  | { kind: "IntervalSet"; word: string; due: number }
  | { kind: "ThetaUpdated"; theta: number; se: number }
  | { kind: "ProbeEligible"; word: string }
  | { kind: "ContextFrameLogged"; word: string; frameId: string }
  | { kind: "PassageComposed"; passage: Passage }
  /** ADR-022. A topic's tally moved. NEVER RENDERED -- see
   *  useEngineSession.ts and docs/seams.md's same-day amendment. This effect
   *  crosses the seam because filtering it out at the binding would be the
   *  binding deciding what the host may know; the host persists it and does
   *  nothing else with it. finished/abandoned are counts of the reader's own
   *  behaviour, and a screen that shows them is the app telling the reader
   *  what it has noticed about them -- law 3, and the single most tempting
   *  violation in this codebase because the data is right there. */
  | { kind: "TopicAffinityUpdated"; topic: string; finished: number; abandoned: number };

export interface Passage {
  id: string;
  pool: Pool;
  /** In render order. Every slot is filled -- an unfilled one would be
   *  visible, and the reader must never be able to tell which words the app
   *  chose. */
  fills: { index: number; word: string }[];
  /** Reported back in PassageFinished.wordsSeen for whatever was read
   *  cleanly. targets are scheduled encounters; seeded are first contact. */
  targets: string[];
  seeded: string[];
  /** ADR-022, carried through from the chosen Candidate. Nothing on the host
   *  side reads this back -- it is here because the engine's own Passage
   *  carries it, and a wire type that drops a field is a wire type that lies. */
  topics: string[];
}

export interface EnginePort {
  /** Serialized LearnerState in, out. The shell persists the bytes and never
   *  reads inside them. */
  load(document: string | null): void;
  save(): string;

  plan(request: Request, nowMs: number): Needs;
  decide(request: Request, frame: Frame, nowMs: number): Effect[];
}
