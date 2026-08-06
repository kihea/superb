// A practice's display, running across the top of its tile.
//
// Unlike the book plates, these never stop. Three tiles moving quietly is the
// difference between a menu and a games room — and unlike a shelf of thirty
// plates, three loops cost nothing. Motion off still stops them, because a
// reader who has asked for stillness means all of it.
import { useEffect, useRef, useState } from "react";
import { playDisplay, PRACTICE_HUE, type Practice } from "../design/playDisplay";
import "./PlayDisplay.css";

function motionAllowed(): boolean {
  if (typeof document === "undefined") return false;
  if (document.documentElement.dataset.motion === "off") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Geist Mono's advance width, as a fraction of the font size. Measured
 *  rather than guessed would be better, but a monospace face's ratio does not
 *  change, and this saves a layout read on every tile. */
const ADVANCE = 0.6;

export function PlayDisplay({
  practice,
  cols,
  rows,
  size = 9,
}: {
  practice: Practice;
  /** A floor. The display grows to fill whatever width its tile gives it —
   *  "across the top" means across all of it, not most of it. */
  cols: number;
  rows: number;
  size?: number;
}) {
  const [t, setT] = useState(0);
  const [wide, setWide] = useState(cols);
  const box = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const width = el.clientWidth;
      if (width > 0) setWide(Math.max(cols, Math.floor(width / (size * ADVANCE))));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [cols, size]);

  useEffect(() => {
    if (!motionAllowed()) return;
    const start = performance.now();
    // A display at 60fps is a waste of a phone's battery for something this
    // coarse: the grid only changes when a whole character does, which is
    // about eleven times a second.
    const timer = window.setInterval(() => setT((performance.now() - start) / 1000), 90);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <pre
      ref={box}
      className="play-display"
      aria-hidden="true"
      style={{ fontSize: size, color: PRACTICE_HUE[practice] }}
    >
      {playDisplay(practice, wide, rows, t)}
    </pre>
  );
}
