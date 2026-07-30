// DERIVATION-003 C2 -- "the general loader, everywhere outside the reading
// state." Re-derived from interface-inspiration/loader.tsx, taking the
// reference over the prototype's own reduction of it (the derivation's own
// instruction): two rings counter-rotating in 3D (rotateX/rotateY inside a
// perspective container), not the prototype's flattened 2D spin. The two
// ring durations (1.1s, 1.4s) and the brand/support colour split are the
// derivation's own numbers, not the inspiration's 2.2s -- this component
// keeps the inspiration's *reading* of the device and the derivation's own
// timing.
//
// Chrome only (Job 3): this component must never be imported by any
// reading-state component. It renders nothing about the engine or the
// learner -- it has no props because a loader has no state of its own to
// carry, unlike the Orb below.
import "./Loader.css";

export function Loader() {
  return (
    <span className="chrome-loader" role="status" aria-label="Loading" data-chrome-device="loader">
      <span className="chrome-loader__ring chrome-loader__ring--brand" aria-hidden="true" />
      <span className="chrome-loader__ring chrome-loader__ring--support" aria-hidden="true" />
    </span>
  );
}
