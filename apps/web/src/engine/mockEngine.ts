// A stand-in for superb-wasm, built off fixture content (docs/seams.md:
// "Until superb-wasm exists, T4 builds against a hand-written mock
// implementing EnginePort"). It never ships -- see useEngineSession.ts,
// where it is only wired up behind the VITE_MOCK_ENGINE flag. Delete this
// file whole the day the real binding lands; nothing here should survive
// that.
//
// It does not simulate scheduling, ability, or spaced repetition -- that is
// the whole point of leaving it to the real engine. What it proves is the
// loop: plan -> fetch -> decide -> save -> render, with a real passage on
// the other end of it. The one piece of state it does simulate honestly is
// the topic-affinity tally (ADR-022) -- not because this mock recommends
// anything, but because a mock that leaves Candidate.topics empty is
// indistinguishable, by every test, from one that wires it correctly, and
// docs/seams.md's second same-day amendment names exactly that failure.
import type {
  ContentFrame,
  Effect,
  EnginePort,
  Frame,
  Needs,
  Passage,
  Request,
} from "./port";

interface TopicTally {
  finished: number;
  abandoned: number;
}

interface MockState {
  seen: string[];
  current: Passage | null;
  /** ADR-022. Persisted, and -- see useEngineSession.ts -- never read back
   *  by anything that renders. If you are here to add a screen that shows
   *  this, read docs/seams.md's amendment first; it is arguing with you
   *  specifically. */
  topicTally: Record<string, TopicTally>;
}

function emptyState(): MockState {
  return { seen: [], current: null, topicTally: {} };
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
      topics: candidate.topics,
    };
  }
  return {
    id: candidate.id,
    pool: "Sourced",
    fills: [],
    targets: candidate.words,
    seeded: [],
    topics: candidate.topics,
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
        const parsed = JSON.parse(document) as Partial<MockState>;
        state = {
          seen: parsed.seen ?? [],
          current: parsed.current ?? null,
          topicTally: parsed.topicTally ?? {},
        };
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
      const event = request.event;
      if (event.kind === "PassageFinished" || event.kind === "PassageAbandoned") {
        return { kind: "PassageTopics", passage: event.passage };
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
        case "PassageAbandoned": {
          if (state.current) state.seen = [...state.seen, state.current.id].slice(-20);
          state.current = null;
          if (frame.kind !== "Topics") return [];
          const finished = event.kind === "PassageFinished";
          const effects: Effect[] = [];
          for (const topic of frame.topics) {
            const tally = state.topicTally[topic] ?? { finished: 0, abandoned: 0 };
            const updated: TopicTally = {
              finished: tally.finished + (finished ? 1 : 0),
              abandoned: tally.abandoned + (finished ? 0 : 1),
            };
            state.topicTally[topic] = updated;
            effects.push({
              kind: "TopicAffinityUpdated",
              topic,
              finished: updated.finished,
              abandoned: updated.abandoned,
            });
          }
          return effects;
        }
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
