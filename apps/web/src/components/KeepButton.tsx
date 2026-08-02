// The Keep gesture: bookmark outline morphs to a filled check, the pixels
// scatter once, and the card follows the animation into stillness. Keeping
// never explains itself -- no toast, no counter.
import { useState } from "react";
import { PixelScatter } from "./chrome/PixelScatter";

export interface KeepButtonProps {
  /** Fired at the moment of the click -- the write. Never made to wait for
   *  an animation. */
  onKeep: () => void;
  /** Fired once the scatter settles -- the dismissal. */
  onKept: () => void;
}

export function KeepButton({ onKeep, onKept }: KeepButtonProps) {
  const [kept, setKept] = useState(false);
  const [burst, setBurst] = useState(false);

  function handleClick() {
    if (kept) return;
    setKept(true);
    setBurst(true);
    onKeep();
  }

  return (
    <button
      type="button"
      className="gloss-keep-button"
      onClick={handleClick}
      aria-pressed={kept}
      aria-label="Keep"
    >
      {/* Both faces are always in the markup and only their visibility
          swaps. */}
      <span className="gloss-keep-button__icon" aria-hidden="true">
        <span className={`gloss-keep-button__face${kept ? "" : " gloss-keep-button__face--visible"}`}>
          ⌂
        </span>
        <span className={`gloss-keep-button__face${kept ? " gloss-keep-button__face--visible" : ""}`}>
          ✓
        </span>
      </span>
      <span className="gloss-keep-button__label" aria-hidden="true">
        {kept ? "Kept" : "Keep"}
      </span>
      <PixelScatter
        active={burst}
        onDone={() => {
          setBurst(false);
          onKept();
        }}
      />
    </button>
  );
}
