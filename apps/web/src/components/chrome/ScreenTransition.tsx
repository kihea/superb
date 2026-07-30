// DERIVATION-003 E2 -- side-slide with blur, chrome fixed, at the system's
// own 420ms (motion.durationChromeTransition, distinct from durationSlow
// and durationBeam -- see design/tokens.json). Re-derived from
// interface-inspiration/page-transition-side.txt: the outgoing screen
// exits left, the incoming one enters from the right, both pass through a
// touch of blur in transit. "Chrome fixed" is load-bearing (the derivation's
// own words): this component only ever wraps the screen content, never the
// tab bar or any other chrome around it, so the slide reads as the same
// app moving rather than a new screen arriving.
//
// There is no router with multiple screens yet (T4 built the reading state
// alone; Today/Shelf are still ahead). This wraps whatever is keyed as the
// "current screen" today and re-plays its entrance whenever that key
// changes, so the device exists and is provably correct before there is a
// second screen to prove it between.
import "./ScreenTransition.css";
import type { ReactNode } from "react";

export interface ScreenTransitionProps {
  screenKey: string;
  children: ReactNode;
}

export function ScreenTransition({ screenKey, children }: ScreenTransitionProps) {
  return (
    <div className="chrome-screen-transition" data-chrome-device="screen-transition">
      <div key={screenKey} className="chrome-screen-transition__panel">
        {children}
      </div>
    </div>
  );
}
