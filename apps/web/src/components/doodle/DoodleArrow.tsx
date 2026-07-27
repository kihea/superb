// A hand-drawn nav icon, added per Kihea's own direction (2026-07-27, relayed
// by the team lead): "custom doodles and well placed icon doodles for maybe
// navigation is encouraged as well." DERIVATION-001 never assigned doodles
// to chrome -- only to the reading surface and the Shelf -- so this is new
// ground, not a re-derivation of something already ruled on.
//
// Sized to DERIVATION-001's own most reusable number: "a doodle mark is one
// unbroken stroke, 100-200px of line, in a 50-90px box" (from
// superb-hand-corner.svg's forty-two surviving loops). This icon's box
// (64x56) sits inside that range, and its single path is one continuous
// stroke -- no second `<path>`, no separate arrowhead glued on -- so it
// reads as the same hand as the margin mark and the break chain rather
// than a generic icon-font glyph redrawn to look sketchy.
//
// Where it may sit: on the one real navigation action this screen has (the
// pull-up affordance), which lives in the chrome, outside the text column,
// and is not attached to any word. It replaces the plain "->" only in
// "drawn" and "inked" -- "bare" keeps today's shipped glyph unchanged.
import "./DoodleArrow.css";

export function DoodleArrow({ className }: { className?: string }) {
  return (
    <svg
      className={`doodle-arrow ${className ?? ""}`.trim()}
      viewBox="0 0 64 56"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="doodle-arrow-stroke"
        d="M6,32 C18,20 26,42 38,28 C34,38 30,34 34,24"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
