// The margin mark, re-derived from DERIVATION-001's reading of
// superb-hand-margin.svg -- three long, loose strokes running the full
// height of the canvas, in a lane 8% of the canvas width. Fresh geometry,
// no path pasted (ADR-019 Decision 4).
//
// Placement follows the shape law exactly: a full-height lane beside the
// passage, static, spanning top to bottom of the viewport regardless of how
// long the passage is -- never stopping partway down, never aligned to a
// line of text, never beside a single word. Position is `fixed`, not tied
// to the card's own height, specifically so it cannot end beside any
// particular line: DERIVATION-001's own reasoning is that a mark ending
// beside line nine is a mark pointing at line nine, and a reader works out
// what it is pointing at. Law 3.
import "./MarginMark.css";

// Three strokes -- the cap DERIVATION-001 draws from Kihea's own margin
// drawing (three strokes) versus the noise drawing that answered the same
// question with four hundred short ones. Loose, wandering paths; no two
// alike, because "nothing should exist at only one scale" (superb-craft)
// applies to a set of three exactly as it does to a single repeated glyph.
const STROKES = [
  "M20,0 C40,120 5,260 35,380 C60,480 15,600 30,720 C40,780 20,790 25,800",
  "M55,0 C30,90 70,220 45,340 C25,440 65,560 50,660 C40,730 60,780 50,800",
  "M80,0 C95,140 60,300 85,420 C105,520 70,640 90,760 C96,782 82,792 88,800",
];

export function MarginMark({ className, side = "left" }: { className?: string; side?: "left" | "right" }) {
  return (
    <svg
      className={`margin-mark margin-mark--${side} ${className ?? ""}`.trim()}
      viewBox="0 0 100 800"
      preserveAspectRatio="none"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      {STROKES.map((d, i) => (
        <path key={i} className="margin-mark-stroke" d={d} fill="none" strokeLinecap="round" />
      ))}
    </svg>
  );
}
