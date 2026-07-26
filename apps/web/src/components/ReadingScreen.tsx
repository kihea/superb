// The screen itself. One material now (ADVISORY-008 §1 -- the picker that
// asked glass-or-paper was re-deriving a settled question; ADR-019 settled
// it 2026-07-25). The room the passage floats in is dark-first glass and
// metal; the passage card itself stays ink-and-paper regardless (ADR-019
// Decision 1) -- see design/tokens.json.
import { useEngineSession } from "../engine/useEngineSession";
import "./ReadingScreen.css";
import { PassagePage } from "./PassagePage";

export function ReadingScreen() {
  const session = useEngineSession();

  return (
    <div className="reading-screen">
      {/* Glass needs something behind it or it is a grey box (ADVISORY-008
         §3). Two large, diffuse lights so the metal edge below has
         something to refract. Deliberately not animated: ADR-019 as
         amended -- material persists while a passage is on screen, events
         stop, and this build is the reading state end to end. A future
         non-reading surface may let these drift; this one does not. */}
      <div className="reading-screen-aura" aria-hidden="true" />
      <div className="reading-page metal">
        {session.status === "loading" && (
          <p className="reading-status" data-text="Finding something to read.">
            Finding something to read.
          </p>
        )}
        {session.status === "error" && (
          <p
            className="reading-status"
            data-text="No engine wired up for a production build yet — T2's superb-wasm binding lands here."
          >
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
