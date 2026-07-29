// The loop, exactly as docs/seams.md states it:
//   plan -> content.fetch -> decide -> storage.put -> render
// This hook is the only place that loop is wired. The reading screen
// downstream only ever sees the passage that comes out the other end of it.
import { useCallback, useEffect, useRef, useState } from "react";
import type { EnginePort, Passage, Request } from "./port";
import { createWasmEngine } from "./wasmEngine";
import { candidatesFor, resolve, topicsFor } from "../content/store";
import type { ComposedPassage, SourceExcerpt } from "../content/types";
import {
  loadCurrentPassage,
  loadRecentPassages,
  loadState,
  saveCurrentPassage,
  saveRecentPassages,
  saveState,
} from "../storage/db";

// The last 20 passage ids shown, so a session does not immediately repeat
// what was just read -- shell-owned exclusion state, kept out of the
// engine's own persisted bytes (storage/db.ts's own comment on why).
const RECENT_CAP = 20;

type Status = "loading" | "ready" | "error";

interface SessionState {
  status: Status;
  passage: Passage | null;
  record: ComposedPassage | SourceExcerpt | null;
}

export interface EngineSession extends SessionState {
  tapWord: (word: string, position: number) => void;
  finish: () => void;
}

async function fetchFrame(engine: EnginePort, request: Request, now: number, recent: string[]) {
  const needs = engine.plan(request, now);
  if (needs.kind === "Nothing") return { kind: "Nothing" as const };
  if (needs.kind === "PassageCandidates") {
    // The exclusion set only ever carries ids already shown -- never
    // Candidate.words or anything about a candidate's content. Ranking
    // beyond that (curated-first, then shuffled) lives entirely in
    // content/store.ts and does not read `words` either: the tripwire
    // docs/seams.md and the M2 contract's item 5b name (nothing schedules
    // against Candidate.words on the real corpus) holds here by
    // construction, not by omission -- see candidatesFor's own comment and
    // tests/candidates-ranking.test.ts.
    const excluded = new Set(recent);
    const content = await candidatesFor(excluded);
    return { kind: "Content" as const, content };
  }
  if (needs.kind === "PassageTopics") {
    const topics = await topicsFor(needs.passage);
    return { kind: "Topics" as const, topics };
  }
  // ItemDifficulty is not needed by anything this build's screens ask for.
  return { kind: "Nothing" as const };
}

export function useEngineSession(): EngineSession {
  const engineRef = useRef<EnginePort | null>(null);
  const recentRef = useRef<string[]>([]);
  const [state, setState] = useState<SessionState>({ status: "loading", passage: null, record: null });

  const run = useCallback(async (request: Request) => {
    const engine = engineRef.current;
    if (!engine) return;
    const now = Date.now();
    const frame = await fetchFrame(engine, request, now, recentRef.current);
    const effects = engine.decide(request, frame, now);
    await saveState(engine.save());

    // Only PassageComposed ever reaches the screen. TopicAffinityUpdated
    // (ADR-022) is in `effects` too whenever a passage finishes or is
    // abandoned, and it stops here, on purpose -- docs/seams.md's amendment:
    // "no display, no 'you've been enjoying...', no topic chips, no Settings
    // readout, no debug overlay that survives to production." The engine
    // cannot enforce that; this line is where the surface does.
    const composed = effects.find((e) => e.kind === "PassageComposed");
    if (composed && composed.kind === "PassageComposed") {
      const record = await resolve(composed.passage.id);
      recentRef.current = [...recentRef.current, composed.passage.id].slice(-RECENT_CAP);
      await Promise.all([saveRecentPassages(recentRef.current), saveCurrentPassage(composed.passage)]);
      setState({ status: "ready", passage: composed.passage, record });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let engine: EnginePort;
      try {
        engine = await createWasmEngine();
      } catch {
        if (!cancelled) setState({ status: "error", passage: null, record: null });
        return;
      }
      engineRef.current = engine;
      const [saved, recent, current] = await Promise.all([
        loadState(),
        loadRecentPassages(),
        loadCurrentPassage<Passage>(),
      ]);
      recentRef.current = recent;
      engine.load(saved);
      if (cancelled) return;

      // A passage already in flight resumes exactly as it was -- rendered
      // straight from the shell's own record of it, no engine call at all.
      // superb-core's LearnerState carries no notion of "a passage on
      // screen" (it only learns one happened once PassageFinished/
      // PassageAbandoned arrives), so calling NextPassage here would compose
      // a fresh one and silently drop whatever the reader had not finished.
      if (current) {
        const record = await resolve(current.id);
        if (!cancelled) setState({ status: "ready", passage: current, record });
        return;
      }
      await run({ kind: "NextPassage" });
    })();
    return () => {
      cancelled = true;
    };
    // run is stable (useCallback, empty deps); this effect is boot-once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tapWord = useCallback(
    (word: string, position: number) => {
      const passageId = state.passage?.id;
      if (!passageId) return;
      void run({ kind: "ProcessEvent", event: { kind: "GlossTap", word, passage: passageId, position } });
    },
    [run, state.passage?.id],
  );

  const finish = useCallback(() => {
    const passage = state.passage;
    if (!passage) return;
    void (async () => {
      await run({
        kind: "ProcessEvent",
        event: { kind: "PassageFinished", passage: passage.id, wordsSeen: [...passage.targets, ...passage.seeded] },
      });
      await run({ kind: "NextPassage" });
    })();
  }, [run, state.passage]);

  return { ...state, tapWord, finish };
}
