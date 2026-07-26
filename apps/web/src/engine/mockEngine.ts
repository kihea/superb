// A stand-in for superb-wasm, built off fixture content (docs/seams.md:
// "Until superb-wasm exists, T4 builds against a hand-written mock
// implementing EnginePort"). It never ships -- see main.tsx, where it is
// only wired up behind import.meta.env.DEV. Delete this file whole the day
// the real binding lands; nothing here should survive that.
//
// It does not simulate scheduling, ability, or spaced repetition -- that is
// the whole point of leaving it to the real engine. What it proves is the
// loop: plan -> fetch -> decide -> save -> render, with a real passage on
// the other end of it.
import type {
  ContentFrame,
  Effect,
  EnginePort,
  Frame,
  Needs,
  Passage,
  Request,
} from "./port";

interface MockState {
  seen: string[];
  current: Passage | null;
}

function emptyState(): MockState {
  return { seen: [], current: null };
}

function pickPassage(frame: ContentFrame): Passage {
  // candidatesFor() already ranks curated-first; take the first one on
  // offer rather than reshuffling it here.
  const candidate = frame.candidates[0];
  if (candidate.pool === "Composed") {
    return {
      id: candidate.id,
      pool: "Composed",
      fills: candidate.slots.map((s) => ({ index: s.index, word: s.defaultWord })),
      targets: candidate.slots.map((s) => s.defaultWord),
      seeded: [],
    };
  }
  return {
    id: candidate.id,
    pool: "Sourced",
    fills: [],
    targets: candidate.words,
    seeded: [],
  };
}

export function createMockEngine(): EnginePort {
  let state = emptyState();

  return {
    load(document) {
      if (!document) {
        state = emptyState();
        return;
      }
      try {
        const parsed = JSON.parse(document) as MockState;
        state = { seen: parsed.seen ?? [], current: parsed.current ?? null };
      } catch {
        state = emptyState();
      }
    },

    save() {
      return JSON.stringify(state);
    },

    plan(request: Request): Needs {
      if (request.kind === "NextPassage") {
        // A passage already in flight needs nothing re-fetched; decide()
        // below just hands it back so a reload resumes mid-passage.
        if (state.current) return { kind: "Nothing" };
        return { kind: "PassageCandidates", dueWords: [], bandLow: 5000, bandHigh: 25000 };
      }
      return { kind: "Nothing" };
    },

    decide(request: Request, frame: Frame): Effect[] {
      if (request.kind === "NextPassage") {
        if (state.current) {
          return [{ kind: "PassageComposed", passage: state.current }];
        }
        if (frame.kind !== "Content") return [];
        const passage = pickPassage(frame.content);
        state.current = passage;
        return [{ kind: "PassageComposed", passage }];
      }

      const event = request.event;
      switch (event.kind) {
        case "GlossTap":
          return [{ kind: "ContextFrameLogged", word: event.word, frameId: event.passage }];
        case "PassageFinished":
          if (state.current) state.seen = [...state.seen, state.current.id].slice(-20);
          state.current = null;
          return [];
        case "PassageAbandoned":
          state.current = null;
          return [];
        // Not surfaced by this build's screens (no deck or probe view yet
        // -- see workspace/tracks/T4-surface.md's "what to build" list).
        // The seam still declares them, so they still type-check here.
        case "DeckSwipe":
        case "ProbeResult":
        case "ScreenDwell":
          return [];
      }
    },
  };
}

/** What the shell reads back from the seen-list to build the exclusion set
 *  for its next PassageCandidates fetch. */
export function seenIds(engine: EnginePort): string[] {
  try {
    const parsed = JSON.parse(engine.save()) as MockState;
    return parsed.seen ?? [];
  } catch {
    return [];
  }
}
