// The screen itself. One material now (ADVISORY-008 §1 -- the picker that
// asked glass-or-paper was re-deriving a settled question; ADR-019 settled
// it 2026-07-25). The room the passage floats in is dark-first glass and
// metal; the passage card itself stays ink-and-paper regardless (ADR-019
// Decision 1) -- see design/tokens.json.
import { useEffect } from "react";
import { useEngineSession } from "../engine/useEngineSession";
import "./ReadingScreen.css";
import { PassagePage } from "./PassagePage";
import { getCandidate } from "../register-candidates";
import { MarginMark } from "./doodle/MarginMark";

export function ReadingScreen() {
  const session = useEngineSession();
  // Item 7's picker (workspace/decisions, ADVISORY-012 Directive 2) -- see
  // register-candidates.ts. "bare" (no query param) is byte-for-byte the
  // screen PR #31 already merged.
  const candidate = getCandidate();

  // Root-scoped, not just the class below: the pull-up button carrying
  // DoodleArrow is portalled to document.body (PassagePage.tsx), outside
  // this component's own DOM subtree, so its candidate-scoped CSS
  // variables (ReadingScreen.css) have to live somewhere a portal can still
  // see them.
  useEffect(() => {
    document.documentElement.dataset.candidate = candidate;
    return () => {
      delete document.documentElement.dataset.candidate;
    };
  }, [candidate]);

  return (
    <div className={`reading-screen reading-screen--${candidate}`}>
      {/* Glass needs something behind it or it is a grey box (ADVISORY-008
         §3). Two large, diffuse lights so the metal edge below has
         something to refract. Deliberately not animated: ADR-019 as
         amended -- material persists while a passage is on screen, events
         stop, and this build is the reading state end to end. A future
         non-reading surface may let these drift; this one does not. */}
      <div className="reading-screen-aura" aria-hidden="true" />
      {/* The margin mark (DERIVATION-001, superb-hand-margin.svg): full-
         height, static, in the room rather than on the page. Absent in
         "bare"; present at rising presence in "drawn" and "inked". */}
      {candidate !== "bare" && <MarginMark side="left" />}
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
            candidate={candidate}
          />
        )}
      </div>
    </div>
  );
}
