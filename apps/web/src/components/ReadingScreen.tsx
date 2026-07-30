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
import { PixelBreak } from "./chrome/PixelBreak";
import { useState } from "react";

export function ReadingScreen() {
  const session = useEngineSession();
  const [breaking, setBreaking] = useState(false);

  // ADR-036's B4 lives here, not inside PassagePage's own "Keep reading"
  // button: that button unmounts the instant `session.finish` swaps the
  // passage (PassagePage remounts on the new `passage.id` key), which tore
  // the flourish down before it painted a frame when it was a child of the
  // button -- watched failing deterministically, not merely under load.
  // ReadingScreen persists across that swap, so the break is anchored here
  // instead, at the same fixed bottom-centre spot the button itself sits
  // at (see the CSS), reading as if it came from the button without being
  // tied to its lifecycle.
  function handleFinish() {
    setBreaking(true);
    session.finish();
  }

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
          <p className="reading-status" data-text="Something went wrong loading this session.">
            Something went wrong loading this session.
          </p>
        )}
        {session.status === "ready" && session.record && session.passage && (
          <PassagePage
            key={session.passage.id}
            record={session.record}
            passage={session.passage}
            onWordTap={session.tapWord}
            onFinish={handleFinish}
          />
        )}
      </div>
      {/* Fixed at the same bottom-centre spot as the "Keep reading" button
         (PassagePage.css's own .passage-continue), so the flourish reads as
         coming from that button even though it outlives it -- the layering
         fix ADR-036 Decision 2 names is satisfied the same way it would be
         inside the button: nowhere near the passage text, extent bounded to
         this one small area rather than the whole screen. */}
      <div className="reading-screen-break" aria-hidden="true">
        <PixelBreak active={breaking} onDone={() => setBreaking(false)} />
      </div>
    </div>
  );
}
