// Screen 14's entry point, where frame 1v says it lives: "Nothing in the
// reading screen advertises sharing. It appears only when you hold a
// sentence, next to Keep and Hear it." So this is raised by holding a
// sentence in the passage, and there is no other way to reach it.
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
  onKeep: () => void;
  onHear: () => void;
  onSend: () => void;
  onDismiss: () => void;
}

const CARD_WIDTH_MAX = 420;
const EDGE = 18;

export function HoldMenu({ anchor, onKeep, onHear, onSend, onDismiss }: HoldMenuProps) {
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
          <span>Keep the words</span>
          {/* Frame 2k draws "· 3 new" beside this, and law 3 forbids a
              number facing the reader on a reading surface. That is Kihea's
              call rather than a builder's, so it ships without the count
              until he answers -- one line to restore.
              DECISION PENDING: https://github.com/kihea/superb/issues/102 */}
        </button>
        <span className="hold-menu__rule" />
        <button type="button" className="hold-menu__item" role="menuitem" onClick={onHear}>
          <span>Hear it</span>
          <span className="hold-menu__orb">
            <VoiceOrb size={18} />
          </span>
        </button>
        <span className="hold-menu__rule" />
        <button
          type="button"
          className="hold-menu__item hold-menu__item--brand"
          role="menuitem"
          onClick={onSend}
        >
          <span>Send to someone</span>
          <span className="hold-menu__aside">as a card</span>
        </button>
      </div>
    </div>,
    document.body,
  );
}
