// DERIVATION-003 C3 + C4 -- the orb's material (liquid glass, morphing
// border-radius, no hue rotation -- the hue drift is killed) and its state
// machine, adjusted per Kihea's note to build the "thinking" state from
// interface-inspiration/loader.tsx's own intersecting rings rather than the
// prototype's flattened borrowing of them.
//
// ADR-020's amendment, unchanged by ADR-036 (T5's Job 4 note): "the orb's
// rendering is a function of the voice channel's state and nothing else.
// Not passage position, not word states, not theta, not session history --
// nothing the engine knows about the learner may reach it." This component
// therefore takes exactly one prop, an enum, and nothing that could carry
// engine state through it by accident.
//
// Chrome only (Job 3): this track never mounts the Orb inside the reading
// state -- ADR-020's amendment governs that crossing and is out of this
// track's scope. Kept alive here strictly as a chrome device.
import "./Orb.css";
import { Loader } from "./Loader";

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

export interface OrbProps {
  state: OrbState;
}

export function Orb({ state }: OrbProps) {
  return (
    <span
      className={`chrome-orb chrome-orb--${state}`}
      role="status"
      aria-label={`voice ${state}`}
      data-chrome-device="orb"
    >
      <span className="chrome-orb__material" aria-hidden="true" />
      {state === "thinking" && (
        <span className="chrome-orb__thinking" aria-hidden="true">
          <Loader />
        </span>
      )}
    </span>
  );
}
