// Whether ambient motion is allowed at all -- Settings' own switch, applied
// to <html> the same way Night is (theme.ts): an attribute rather than a
// React context, because the one thing that reads it live (VoiceOrb's own
// canvas loop) is not a descendant of whatever renders the switch and has
// no other way to hear about a change at runtime.
//
// PR-104 review (I-1): the boot path did not exist -- only Settings.tsx's
// own effect ever wrote `data-motion`, so a fresh tab landing straight on
// "/" with "off" already in storage got a spinning orb anyway, because
// nothing had restored the attribute before VoiceOrb's first paint read it.
// Fixed the way theme.ts's own boot problem already is: one hook, called
// once at the root (App.tsx) purely for the restore, and again wherever the
// switch itself lives (Settings.tsx) -- both instances read and write the
// same key, so neither can drift from what is actually stored.
import { useEffect, useState } from "react";

const MOTION_KEY = "superb.motion";

function readMotion(): boolean {
  try {
    return window.localStorage.getItem(MOTION_KEY) !== "off";
  } catch {
    // Private browsing, or storage disabled. On is the same default
    // theme.ts's own read() falls back to.
    return true;
  }
}

export function applyMotion(on: boolean): void {
  document.documentElement.setAttribute("data-motion", on ? "on" : "off");
}

export function useMotion() {
  const [motion, setMotion] = useState<boolean>(readMotion);

  useEffect(() => {
    applyMotion(motion);
    try {
      window.localStorage.setItem(MOTION_KEY, motion ? "on" : "off");
    } catch {
      // Nothing to do; the choice still holds for this session.
    }
  }, [motion]);

  return { motion, setMotion };
}
