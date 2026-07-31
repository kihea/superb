// Kihea's dotted orb (workspace/prototypes/screens-drop/superb-orb.js in the
// private root), ported from a custom element to a React component. The
// drawing maths is his, unchanged: dots on a rotating sphere, monochrome,
// painted in whatever `color` the element inherits, plain 2D canvas.
//
// One deliberate difference from his file. In his canvas the `still` state
// spins slowly forever; here it paints exactly one frame and stops. While a
// passage is on screen the reading state is material, not event (ADR-028's
// amendment) -- a thing turning quietly in the corner of a page nobody
// touched is an event. Motion starts when the reader asks to be read to and
// stops when the voice does.
//
// This is NOT one of the components/chrome/ devices and carries no
// `data-chrome-device` attribute: those are the glass-and-metal kit from T5,
// and the containment sweep in e2e/chrome-containment.spec.ts is about that
// kit. This orb is a different object, drawn by Kihea for exactly this place
// on exactly this screen (frame 2b: "the page stays the interface"). Whether
// the reading state should hold a voice control at all is a law question
// rather than a build one -- DECISION PENDING:
// https://github.com/kihea/superb/issues/99
import { useEffect, useRef } from "react";
import "./VoiceOrb.css";

export type OrbState = "still" | "listening" | "speaking";

export interface VoiceOrbProps {
  state?: OrbState;
  /** CSS pixels, square. His frames use 22 in a top row and 56 in a sheet. */
  size?: number;
}

const RINGS = 11;

function paint(canvas: HTMLCanvasElement, dpr: number, size: number, state: OrbState, t: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const small = size <= 30;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = getComputedStyle(canvas).color || "#000";

  const R = (size / 2 - (small ? 1.6 : 3.4)) * dpr;
  const spin = t * (state === "still" ? 0.16 : state === "listening" ? 0.34 : 0.5);
  const rings = small ? 7 : RINGS;
  const baseDot = (small ? 0.85 : 1.25) * dpr;

  for (let i = 0; i < rings; i += 1) {
    const lat = -Math.PI / 2 + (Math.PI * (i + 0.5)) / rings;
    const cosL = Math.cos(lat);
    const n = Math.max(4, Math.round((small ? 12 : 22) * cosL + 3));

    let rMod = 1;
    let dotMod = 1;
    if (state === "listening") {
      rMod = 1 + 0.055 * Math.sin(t * 2.6 - i * 0.7);
      dotMod = 1 + 0.35 * Math.max(0, Math.sin(t * 2.6 - i * 0.7));
    } else if (state === "speaking") {
      rMod = 1 + 0.075 * Math.sin(t * 4.2 - i * 0.9);
    }

    for (let j = 0; j < n; j += 1) {
      const lon = (Math.PI * 2 * j) / n + spin + i * 0.24;
      const x = cx + R * rMod * cosL * Math.sin(lon);
      const y = cy + R * rMod * Math.sin(lat);
      const depth = cosL * Math.cos(lon);
      const front = (depth + 1) / 2;

      let a = 0.14 + front * 0.72;
      let d = baseDot * (0.62 + front * 0.6) * dotMod;

      if (state === "speaking") {
        // An undulating sash rolls across the globe.
        const band = 0.42 * Math.sin(lon * 2 - t * 2.1);
        const near = 1 - Math.min(1, Math.abs(Math.sin(lat) - band) / 0.34);
        a = 0.1 + front * 0.4 + near * front * 0.55;
        d = baseDot * (0.55 + front * 0.45 + near * 0.75);
      } else if (state === "listening") {
        // A waveform sweeps the meridians.
        const wave = Math.max(0, Math.sin(lon - t * 2.2));
        a = 0.12 + front * 0.5 + wave * front * 0.42;
        d = baseDot * (0.6 + front * 0.5 + wave * 0.4);
      } else {
        a = 0.1 + front * 0.42;
      }

      ctx.globalAlpha = Math.min(1, a);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.4, d), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

export function VoiceOrb({ state = "still", size = 22 }: VoiceOrbProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (state === "still" || reduced) {
      // One frame, at a fixed angle, and then nothing -- see the file header.
      paint(canvas, dpr, size, state, 0);
      return;
    }

    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      paint(canvas, dpr, size, state, (now - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state, size]);

  return <canvas ref={ref} className="voice-orb" role="img" aria-label="Voice" data-orb-state={state} />;
}
