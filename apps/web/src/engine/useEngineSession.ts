// The loop, exactly as docs/seams.md states it:
//   plan -> content.fetch -> decide -> storage.put -> render
// This hook is the only place that loop is wired. Everything downstream
// (the two register screens) only ever sees the passage that comes out the
// other end of it.
import { useCallback, useEffect, useRef, useState } from "react";
import type { EnginePort, Passage, Request } from "./port";
import { createMockEngine, seenIds } from "./mockEngine";
import { candidatesFor, resolve } from "../content/store";
import type { ComposedPassage, SourceExcerpt } from "../content/types";
import { loadState, saveState } from "../storage/db";

// Guarded behind an explicit build flag, not Vite's dev/prod mode --
// docs/seams.md says the mock "never ships", and this whole app has never
// shipped, so every build of it right now is the preview this PR asks to
// be judged on. VITE_MOCK_ENGINE defaults to on; a real production
// deployment sets it to "false" explicitly (or, more likely, this file is
// simply gone by then -- "the mock is deleted the day T2's binding lands").
function makeEngine(): EnginePort | null {
  if (import.meta.env.VITE_MOCK_ENGINE !== "false") return createMockEngine();
  return null;
}

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

async function fetchFrame(engine: EnginePort, request: Request, now: number) {
  const needs = engine.plan(request, now);
  if (needs.kind === "Nothing") return { kind: "Nothing" as const };
  if (needs.kind === "PassageCandidates") {
    const excluded = new Set(seenIds(engine));
    const content = await candidatesFor(excluded);
    return { kind: "Content" as const, content };
  }
  // ItemDifficulty is not needed by anything this build's screens ask for.
  return { kind: "Nothing" as const };
}

export function useEngineSession(): EngineSession {
  const engineRef = useRef<EnginePort | null>(null);
  const [state, setState] = useState<SessionState>({ status: "loading", passage: null, record: null });

  const run = useCallback(async (request: Request) => {
    const engine = engineRef.current;
    if (!engine) return;
    const now = Date.now();
    const frame = await fetchFrame(engine, request, now);
    const effects = engine.decide(request, frame, now);
    await saveState(engine.save());

    const composed = effects.find((e) => e.kind === "PassageComposed");
    if (composed && composed.kind === "PassageComposed") {
      const record = await resolve(composed.passage.id);
      setState({ status: "ready", passage: composed.passage, record });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const engine = makeEngine();
      engineRef.current = engine;
      if (!engine) {
        setState({ status: "error", passage: null, record: null });
        return;
      }
      const saved = await loadState();
      engine.load(saved);
      if (cancelled) return;
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
