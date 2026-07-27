// The passage-break chain, re-derived from DERIVATION-001's reading of
// superb-hand-break.svg (workspace/decisions/DERIVATION-001-doodles.md) --
// reference only, no path from that file is reused here (ADR-019 Decision
// 4). Kihea drew a chain of nine linked loops in three continuous strokes,
// not one glyph, at a 1.23-wide-to-1-tall unit ratio; the ink was a flat
// 11% of the ornament's own height.
//
// This component is a fresh chain of the same unit ratio, laid out
// explicitly (not tiled) so one unit in the run can be the dropped tooth --
// the pixel drawings' own shape (pause-pixel.svg): every ornament that
// repeats more than four times in this product drops or displaces one unit,
// chosen once, never randomised per render.
import "./BreakChain.css";

const UNIT_W = 130;
const UNIT_H = 106;
const UNITS = 7;
// Chosen once, by the builder, and fixed -- a variation that changed every
// render would be a loop running, not a person deciding (DERIVATION-001).
const DROPPED_UNIT = 3;

export function BreakChain({ className }: { className?: string }) {
  const width = UNIT_W * UNITS;
  return (
    <svg
      className={`break-chain ${className ?? ""}`.trim()}
      viewBox={`0 0 ${width} ${UNIT_H}`}
      preserveAspectRatio="none"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      {Array.from({ length: UNITS }, (_, i) => {
        if (i === DROPPED_UNIT) return null;
        const x = i * UNIT_W;
        // One continuous S-curve per unit -- a linked loop, not a straight
        // repeat -- so neighbouring units read as a chain when they tile.
        return (
          <path
            key={i}
            className="break-chain-link"
            d={`M${x},${UNIT_H / 2} Q${x + UNIT_W * 0.25},0 ${x + UNIT_W * 0.5},${UNIT_H / 2} Q${x + UNIT_W * 0.75},${UNIT_H} ${x + UNIT_W},${UNIT_H / 2}`}
            fill="none"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}
