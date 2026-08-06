// The plate, on the page.
//
// Two stacked <pre>s over the same grid: the field, drawn dim, and the carved
// letters, drawn in the category's colour. They have to be two layers rather
// than one coloured string because a gradient title needs real glyphs to clip
// to — see markPaint in design/plate.ts.
//
// Nothing here animates until you look at it. A shelf of thirty plates all
// breathing at once is a screensaver; one breathing under the pointer is a
// book noticing you.
import { useEffect, useState } from "react";
import { dimOf, kindHue, markPaint, plate, plateCard } from "../design/plate";
import "./Plate.css";

/** Motion is a setting, and a paint loop is not something a CSS rule can
 *  stop — so every loop in the app asks this first. */
function motionAllowed(): boolean {
  if (typeof document === "undefined") return false;
  if (document.documentElement.dataset.motion === "off") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Advances while `on`, holds at zero otherwise. */
function usePhase(on: boolean, step = 0.16, ms = 55): number {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!on || !motionAllowed()) {
      setPhase(0);
      return;
    }
    const timer = window.setInterval(() => setPhase((p) => p + step), ms);
    return () => window.clearInterval(timer);
  }, [on, step, ms]);
  return on ? phase : 0;
}

export interface PlateProps {
  /** What the plate is of. The same seed always draws the same plate. */
  seed: string;
  /** The category, which decides the colour. */
  kind?: string;
  /** Grid size, in characters. */
  cols: number;
  rows: number;
  /** Character size. The grid is monospaced, so this sets the plate's size. */
  size?: number;
  /** Set while the pointer is over whatever owns this plate. */
  live?: boolean;
  className?: string;
}

/** The small plate: a mark beside a title. */
export function Plate({ seed, kind, cols, rows, size = 10, live = false, className }: PlateProps) {
  const phase = usePhase(live);
  const { field, mark } = plate(seed, cols, rows, phase);
  const hue = kindHue(kind);
  return (
    <span className={`plate${className ? ` ${className}` : ""}`} aria-hidden="true" style={{ fontSize: size }}>
      <pre className="plate__field" style={{ color: dimOf(hue, live ? 0.42 : 0.24) }}>
        {field}
      </pre>
      <pre className="plate__mark" style={markPaint(seed, kind)}>
        {mark}
      </pre>
    </span>
  );
}

/** The card plate: the art is the tile. Two letters carved large and still;
 *  the whole title running along the foot once you look at it. */
export function PlateTile({ seed, kind, cols, rows, size = 10, live = false, className }: PlateProps) {
  const phase = usePhase(live, 0.2, 50);
  const { field, mark } = plateCard(seed, cols, rows, phase, live);
  const hue = kindHue(kind);
  return (
    <span className={`plate plate--tile${className ? ` ${className}` : ""}`} aria-hidden="true" style={{ fontSize: size }}>
      <pre className="plate__field" style={{ color: dimOf(hue, live ? 0.4 : 0.22) }}>
        {field}
      </pre>
      <pre className="plate__mark" style={markPaint(seed, kind)}>
        {mark}
      </pre>
    </span>
  );
}
