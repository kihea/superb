// ADR-036 Decision 1 -- B4, "pixel flourish assembles block by block, then
// disassembles," the passage-to-passage break the reading state now
// admits (DERIVATION-002/003 held it as chrome-only; Kihea's answer on
// issue #79 overruled that boundary for this device alongside A3's
// scatter). It is reader-started (fired only by the reader's own tap on
// "Keep reading") and ends in stillness (it fully disassembles and leaves
// nothing running), which is the test DERIVATION-002 states as the rule
// that survives the amendment.
//
// The layering fix ADR-036 Decision 2 names is why this is bounded to the
// button that emits it (`position: relative` on the caller, this
// component fills that box with `inset: 0`) rather than to the passage
// card -- a control's own box, portalled to document.body same as the
// "Keep reading" button itself, sits far from the passage text, so the
// flourish's extent never approaches it.
import "./PixelBreak.css";
import { useEffect, useState, type CSSProperties } from "react";

const CELLS = Array.from({ length: 16 }, (_, i) => {
  const angle = (i / 16) * Math.PI * 2;
  const distance = 30 + (i % 4) * 5;
  return {
    dx: Math.cos(angle) * distance,
    dy: Math.sin(angle) * distance,
    delay: (i % 4) * 22,
  };
});

const ASSEMBLE_MS = 260;
const HOLD_MS = 120;
const DISASSEMBLE_MS = 340;
const TEARDOWN_MS = ASSEMBLE_MS + HOLD_MS + DISASSEMBLE_MS + 22 * 3 + 60;

export interface PixelBreakProps {
  active: boolean;
  onDone?: () => void;
}

export function PixelBreak({ active, onDone }: PixelBreakProps) {
  const [rendered, setRendered] = useState(active);

  useEffect(() => {
    if (!active) return;
    setRendered(true);
    const timer = setTimeout(() => {
      setRendered(false);
      onDone?.();
    }, TEARDOWN_MS);
    return () => clearTimeout(timer);
  }, [active, onDone]);

  if (!rendered) return null;

  return (
    <span
      className="chrome-pixel-break"
      aria-hidden="true"
      data-chrome-device="pixel-break"
      style={
        {
          "--pb-assemble": `${ASSEMBLE_MS}ms`,
          "--pb-hold": `${HOLD_MS}ms`,
          "--pb-disassemble": `${DISASSEMBLE_MS}ms`,
        } as CSSProperties
      }
    >
      {CELLS.map((cell, i) => (
        <span
          key={i}
          className="chrome-pixel-break__cell"
          style={
            {
              "--dx": `${cell.dx}px`,
              "--dy": `${cell.dy}px`,
              animationDelay: `${cell.delay}ms`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}
