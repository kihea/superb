// The screen itself, built once and rendered under both registers -- the
// register only ever changes what CSS custom properties resolve to
// (design/tokens.json, ADR-019 Decision 4: one file, both registers, never
// two implementations quietly drifting apart).
import { useEngineSession } from "../engine/useEngineSession";
import "./ReadingScreen.css";
import { PassagePage } from "./PassagePage";
import type { Register } from "../design/register";

export interface ReadingScreenProps {
  register: Register;
}

export function ReadingScreen({ register }: ReadingScreenProps) {
  const session = useEngineSession();

  return (
    <div className="reading-screen">
      {register === "glass" && <div className="reading-screen-glow" aria-hidden="true" />}
      <div className="reading-page">
        {session.status === "loading" && <p className="reading-status">Finding something to read.</p>}
        {session.status === "error" && (
          <p className="reading-status">
            No engine wired up for a production build yet — T2&apos;s superb-wasm binding lands here.
          </p>
        )}
        {session.status === "ready" && session.record && session.passage && (
          <PassagePage
            key={session.passage.id}
            record={session.record}
            passage={session.passage}
            onWordTap={session.tapWord}
            onFinish={session.finish}
          />
        )}
      </div>
    </div>
  );
}
