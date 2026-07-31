// DERIVATION-003 D5 -- glass card, travelling border gradient on hover,
// press ripple. "Somewhat important" is the architect's own bound, stated
// in the derivation: a card qualifying for this treatment is the primary
// action of the screen it is on, and there is at most one per screen. That
// bound is enforced by the caller (a screen composing two BeamCards is a
// misuse of this component, not a variant of it), not by this file, since
// a component cannot see its siblings.
//
// On a touch-only surface there is no hover, so per ADR-032 (the phone is
// the reference surface) the travelling gradient never fires there -- only
// the press ripple does. Detected with a media query rather than UA
// sniffing, same posture the rest of this codebase takes toward feature
// detection.
import "./BeamCard.css";
import type { MouseEvent, ReactNode } from "react";
import { useState } from "react";

export interface BeamCardProps {
  children: ReactNode;
  onClick?: () => void;
}

export function BeamCard({ children, onClick }: BeamCardProps) {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  function handlePointerDown(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const id = Date.now();
    setRipples((r) => [...r, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    setTimeout(() => setRipples((r) => r.filter((ripple) => ripple.id !== id)), 620);
  }

  return (
    <div
      className="chrome-beam-card metal"
      data-chrome-device="beam-card"
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onPointerDown={handlePointerDown}
    >
      <span className="chrome-beam-card__beam" aria-hidden="true" />
      <div className="chrome-beam-card__content">{children}</div>
      {ripples.map((r) => (
        <span
          key={r.id}
          className="chrome-beam-card__ripple"
          aria-hidden="true"
          style={{ left: r.x, top: r.y }}
        />
      ))}
    </div>
  );
}
