// The screen itself. One material now (ADVISORY-008 §1 -- the picker that
// asked glass-or-paper was re-deriving a settled question; ADR-019 settled
// it 2026-07-25).
//
// The register itself -- how much of Kihea's own hand shows against that
// chrome -- was item 7, and it is now decided: "the register decision,
// receipted 2026-07-27" (workspace/decisions/README.md, private root).
// He chose "a little of his own hand" from three built candidates; the
// other two (no drawn marks at all, and the same marks bolder with the
// chrome dimmed back) were disposable by construction and are deleted
// rather than kept behind a flag -- the screenshots and that ADR entry are
// the record that they existed.
//
// T15 restyled this screen to frame 3a: the room around the passage is now
// paper rather than dark glass. That still left the passage's own ink and
// paper (--page-*) fixed to page.light regardless of the theme, which
// contradicted the fourteen new screens and, once asked (issue #100),
// Kihea's own answer: "the whole screen goes dark? its dark mode" -- ADR-039.
// So --page-* now darkens with the room too (apps/web/scripts/
// tokens-to-css.mjs); nothing in this component changed, since it already
// read --page-* rather than a hard-coded light value.
import { useEngineSession } from "../engine/useEngineSession";
import "./ReadingScreen.css";
import { PassagePage } from "./PassagePage";
import { MarginMark } from "./doodle/MarginMark";
import { PixelBreak } from "./chrome/PixelBreak";
import { Link } from "../router/router";
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
      {/* 3a's top row: one word out, nothing else. The truthful-alpha
         checkpoint (PLAN.md §7) removed two things that used to live here:
         a "Shelf" link (the Shelf screen is still v0mock-backed; Library is
         the one real other room, so the outbound link now goes there
         instead) and the voice orb button, which entered a "listening" /
         "speaking" state and produced no audio -- exactly the kind of
         control the product's own law forbids ("never implies an
         unavailable capability"). The orb returns once Phase 2 wires it to
         a real speech API; until then this row says one true thing. */}
      <header className="reading-top">
        <Link to="/library" className="reading-top__out">
          Library
        </Link>
      </header>
      <div className="reading-page">
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
