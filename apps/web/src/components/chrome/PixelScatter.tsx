// The pixel register's scatter device -- DERIVATION-002/003's A3 ("pixel
// flourish scattering off the button") and D3's confirm burst are the same
// device at two call sites: a chrome control (Job 2) and, per ADR-036, the
// reading-state Keep control (Job 4). It is built once, here, and used by
// both -- which is what makes the pixel-identity requirement (ADR-036
// Decision 3, DERIVATION-002 rule 4) true by construction rather than by
// discipline: this component takes no prop that could ever carry a word's
// target/non-target status, so there is no channel through which that
// status could reach the pixels.
//
// Positions are a fixed array, not random per render -- same convention as
// BreakChain's dropped tooth (DERIVATION-001): a motif that is chosen once
// and stays put is trustworthy in a screenshot review; one reseeded per
// render is not.
import "./PixelScatter.css";
import { useEffect, useState, type CSSProperties } from "react";

// 24 x 15 is the pixel register's own grid unit (DERIVATION-001). Twelve
// cells, fixed angle/distance pairs -- a deterministic ring rather than a
// call to Math.random().
const CELLS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2;
  const distance = 22 + (i % 3) * 6;
  return {
    dx: Math.cos(angle) * distance,
    dy: Math.sin(angle) * distance,
    delay: (i % 4) * 18,
  };
});

export interface PixelScatterProps {
  /** Flips true->false or a changing key to re-fire the burst. The parent
   *  owns when this fires; this component only owns what it looks like. */
  active: boolean;
  onDone?: () => void;
}

// The longest cell delay plus the shared flight duration (durationSlow,
// 460ms) -- a fixed teardown timer rather than relying on the last cell's
// animationend, which never fires under prefers-reduced-motion (the
// animation is suppressed there, not shortened) and would otherwise leave
// inert nodes mounted indefinitely.
const TEARDOWN_MS = 460 + 18 * 3 + 40;

export function PixelScatter({ active, onDone }: PixelScatterProps) {
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
    <span className="chrome-pixel-scatter" aria-hidden="true" data-chrome-device="pixel-scatter">
      {CELLS.map((cell, i) => (
        <span
          key={i}
          className="chrome-pixel-scatter__cell"
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
