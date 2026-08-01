// Raised by holding a sentence in the passage: Keep the words, or hear it.
// A third item, "Send to someone" (frame 1v's own entry into screen 14,
// /share), was removed for the truthful-alpha checkpoint (PLAN.md §7) --
// that screen showed an invented sentence regardless of what was actually
// held, and production navigation may not reach a control that lies about
// what it does. See PassagePage.tsx's own comment at this menu's call site.
//
// The card and its caret are frame 2k's. Portalled to document.body for the
// same reason GlossCard is -- PassagePage's entrance animation leaves a
// transform on its root, which would otherwise become the containing block
// for anything positioned here.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { VoiceOrb } from "./voice/VoiceOrb";
import "./HoldMenu.css";

export interface HoldMenuProps {
  /** Where the held sentence sits on screen, so the caret points into it. */
  anchor: DOMRect;
  /** How many of the sentence's words are the engine's own first contact
      (Passage.seeded) rather than a scheduled review -- see PassagePage's
      call site. Zero is common and says nothing beside "Keep the words". */
  newCount: number;
  onKeep: () => void;
  onHear: () => void;
  onDismiss: () => void;
}

const CARD_WIDTH_MAX = 420;
const EDGE = 18;

export function HoldMenu({ anchor, newCount, onKeep, onHear, onDismiss }: HoldMenuProps) {
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    function onResize() {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [onDismiss]);

  const width = Math.min(CARD_WIDTH_MAX, viewport.w - EDGE * 2);
  const left = Math.min(Math.max(EDGE, anchor.left), viewport.w - width - EDGE);
  // Below the sentence, unless that would put it off the bottom, in which
  // case above it -- the caret follows.
  const below = anchor.bottom + 10;
  const fitsBelow = below + 180 < viewport.h;
  const top = fitsBelow ? below : Math.max(EDGE, anchor.top - 190);
  const caretLeft = Math.min(Math.max(14, anchor.left - left + 14), width - 28);

  return createPortal(
    <div className="hold-menu-layer" onPointerDown={onDismiss}>
      <div
        className={`hold-menu${fitsBelow ? "" : " hold-menu--above"}`}
        style={{ left, top, width }}
        role="menu"
        aria-label="This sentence"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="hold-menu__caret" style={{ left: caretLeft }} aria-hidden="true" />
        <button type="button" className="hold-menu__item" role="menuitem" onClick={onKeep}>
          <span>
            Keep the words
            {/* Frame 2k draws "· 3 new" beside this, and law 3 forbids a
                number facing the reader on a reading surface -- Kihea's own
                exception, decided on issue #102 ("the count is fine man"),
                not a builder's call to make. This is the one place in the
                reading state a number is allowed to face the reader. */}
            {newCount > 0 && <span className="hold-menu__count"> · {newCount} new</span>}
          </span>
        </button>
        <span className="hold-menu__rule" />
        <button type="button" className="hold-menu__item" role="menuitem" onClick={onHear}>
          <span>Hear it</span>
          <span className="hold-menu__orb">
            <VoiceOrb size={18} />
          </span>
        </button>
      </div>
    </div>,
    document.body,
  );
}
