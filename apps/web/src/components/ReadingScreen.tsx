// The screen itself. One material now (ADVISORY-008 §1 -- the picker that
// asked glass-or-paper was re-deriving a settled question; ADR-019 settled
// it 2026-07-25). The room the passage floats in is dark-first glass and
// metal; the passage card itself stays ink-and-paper regardless (ADR-019
// Decision 1) -- see design/tokens.json.
//
// The register itself -- how much of Kihea's own hand shows against that
// chrome -- was item 7, and it is now decided: "the register decision,
// receipted 2026-07-27" (workspace/decisions/README.md, private root).
// He chose "a little of his own hand" from three built candidates; the
// other two (no drawn marks at all, and the same marks bolder with the
// chrome dimmed back) were disposable by construction and are deleted
// rather than kept behind a flag -- the screenshots and that ADR entry are
// the record that they existed.
import { useEngineSession } from "../engine/useEngineSession";
import "./ReadingScreen.css";
import { PassagePage } from "./PassagePage";
import { MarginMark } from "./doodle/MarginMark";

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
      {/* The margin mark (DERIVATION-001, superb-hand-margin.svg): full-
         height, static, in the room rather than on the page. Desktop only --
         there is no room for it beside the card on a phone. */}
      <MarginMark side="left" />
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
