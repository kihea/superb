// DERIVATION-003, family D -- "the marks together build a ladder nobody
// drew": D1's quiet press for low-emphasis controls, D3's icon-crossfade
// confirm for the one action a screen is about, D4's sheen sweep for
// switches. Three tiers, three components, chrome only (Job 3).
import "./ControlLadder.css";
import { useState, type ButtonHTMLAttributes } from "react";
import { PixelScatter } from "./PixelScatter";

/** D1 -- today's system, verbatim: darken on hover, .98 press squash. The
 *  floor of the ladder, for any control that isn't the one thing a screen
 *  is about. */
export function QuietButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className, ...rest } = props;
  return (
    <button
      type="button"
      {...rest}
      className={`chrome-quiet-button${className ? ` ${className}` : ""}`}
      data-chrome-device="quiet-button"
    />
  );
}

export interface ConfirmButtonProps {
  label: string;
  confirmedLabel?: string;
  onConfirm?: () => void;
}

/** D3 -- icon crossfade plus a pixel burst on confirm. The top of the
 *  ladder: the one control a screen is about. The icon swap is re-derived
 *  from interface-inspiration/github-microint.tsx's crossfade (plain CSS
 *  opacity/scale rather than framer-motion, since this stack does not
 *  carry that dependency); the pixel scatter is the pixel register,
 *  shared with Job 4's Keep control via PixelScatter.tsx. */
export function ConfirmButton({ label, confirmedLabel, onConfirm }: ConfirmButtonProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [burst, setBurst] = useState(false);

  function handleClick() {
    setConfirmed(true);
    setBurst(true);
    onConfirm?.();
  }

  return (
    <button
      type="button"
      className="chrome-confirm-button metal"
      data-chrome-device="confirm-button"
      onClick={handleClick}
      aria-pressed={confirmed}
    >
      <span className="chrome-confirm-button__icon" aria-hidden="true">
        <span className={`chrome-confirm-button__icon-face${confirmed ? "" : " chrome-confirm-button__icon-face--visible"}`}>
          ○
        </span>
        <span className={`chrome-confirm-button__icon-face${confirmed ? " chrome-confirm-button__icon-face--visible" : ""}`}>
          ✓
        </span>
      </span>
      <span className="chrome-confirm-button__label">{confirmed && confirmedLabel ? confirmedLabel : label}</span>
      <PixelScatter active={burst} onDone={() => setBurst(false)} />
    </button>
  );
}

export interface SheenSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

/** D4 -- a switch with a sheen sweep. Keeps the system's own spring
 *  (--motion-easing-spring, reserved for the Switch knob alone) and adds
 *  only a thin light sweep across the track on toggle -- a glass
 *  reflection rather than a new motion idea, per the derivation. */
export function SheenSwitch({ checked, onChange, label }: SheenSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`chrome-sheen-switch${checked ? " chrome-sheen-switch--on" : ""}`}
      data-chrome-device="sheen-switch"
      onClick={() => onChange(!checked)}
    >
      <span className="chrome-sheen-switch__track">
        <span className="chrome-sheen-switch__sheen" aria-hidden="true" />
        <span className="chrome-sheen-switch__knob" aria-hidden="true" />
      </span>
      <span className="chrome-sheen-switch__label">{label}</span>
    </button>
  );
}
