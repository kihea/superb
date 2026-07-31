// Kihea's dotted orb (workspace/prototypes/screens-drop/superb-orb.js in the
// private root), ported from a custom element to a React component. The
// drawing maths is his, unchanged: dots on a rotating sphere, monochrome,
// painted in whatever `color` the element inherits, plain 2D canvas.
//
// The `still` state used to paint exactly one frame and stop -- a
// deliberate deviation from his own file, on the reasoning that a passage
// on screen is material rather than event and a thing turning quietly in
// the corner is an event. Kihea overruled that on issue #99: the orb may
// move, and the reader's own out is the motion switch in Settings, not a
// stillness rule the orb enforces on itself. So `still` spins again, at his
// original slow rate, gated by two things that are each already the app's
// answer to "should something move": the Settings motion switch
// (`data-motion` on <html>, Settings.tsx) and `prefers-reduced-motion`.
// Either one collapses `still` back to a single frame.
//
// This is NOT one of the components/chrome/ devices and carries no
// `data-chrome-device` attribute: those are the glass-and-metal kit from T5,
// and the containment sweep in e2e/chrome-containment.spec.ts is about that
// kit. This orb is a different object, drawn by Kihea for exactly this place
// on exactly this screen (frame 2b: "the page stays the interface").
//
// ADR-039's bound on #99: the reader may turn this switch off, but this
// component never turns *itself* off based on anything the engine knows.
// Its only inputs are `state`/`size` (props, chosen by the caller) and the
// two ambient settings above -- never a passage's position, a word's
// state, theta, or session history. Motion here is either "the reader
// asked" (state) or "the reader allows ambient motion at all" (the switch
// and the media query), never "the engine decided this word matters."
import { useEffect, useRef, useState } from "react";
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

function motionOn(): boolean {
  return document.documentElement.getAttribute("data-motion") !== "off";
}

function reducedMotionPreferred(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function VoiceOrb({ state = "still", size = 22 }: VoiceOrbProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Settings can flip the motion switch at any moment this orb is already
  // on screen; a MutationObserver on the attribute is the only way to hear
  // that without polling.
  const [motion, setMotion] = useState(motionOn);
  // PR-104 review, Finding 5: this used to be read once inside the paint
  // effect below, so a reader who changed their OS-level reduced-motion
  // preference mid-session (no reload) went unheard until something else
  // happened to re-render the orb. Subscribed the same way the switch
  // above is, rather than polled.
  const [reduced, setReduced] = useState(reducedMotionPreferred);

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setMotion(motionOn()));
    observer.observe(root, { attributes: true, attributeFilter: ["data-motion"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    // `still`'s own slow turn is the ambient motion the switch and the media
    // query are for; `listening`/`speaking` are the orb doing the thing the
    // reader just asked for, not chrome left running on its own, so the
    // motion switch does not touch them (issue #99) -- only reduced-motion
    // does, same as before.
    if ((state === "still" && !motion) || reduced) {
      // One frame, at a fixed angle, and then nothing.
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
  }, [state, size, motion, reduced]);

  return <canvas ref={ref} className="voice-orb" role="img" aria-label="Voice" data-orb-state={state} />;
}
