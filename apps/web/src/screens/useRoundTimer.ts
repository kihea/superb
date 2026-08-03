// The optional clock on rhyme and association: sixty seconds a round,
// remembered once chosen, and the round simply ends when it runs out --
// the reveal is the same reveal, just sooner. Off by default; practice
// against time is a mode the reader picks, never a pressure the app adds.
import { useCallback, useEffect, useRef, useState } from "react";

export const ROUND_SECONDS = 60;
const TIMER_KEY = "superb.challengeTimer";

export function useTimedPreference(): [boolean, () => void] {
  const [timed, setTimed] = useState(() => {
    try {
      return window.localStorage.getItem(TIMER_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = useCallback(() => {
    setTimed((on) => {
      try {
        window.localStorage.setItem(TIMER_KEY, on ? "0" : "1");
      } catch {
        // Private browsing: the mode still holds for this visit.
      }
      return !on;
    });
  }, []);
  return [timed, toggle];
}

/** Counts down while `active`, restarting whenever `roundKey` changes.
 *  Calls `onExpire` exactly once per round when it reaches zero. */
export function useRoundTimer(active: boolean, roundKey: unknown, onExpire: () => void): number {
  const [left, setLeft] = useState(ROUND_SECONDS);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!active) return;
    setLeft(ROUND_SECONDS);
    const started = Date.now();
    const id = window.setInterval(() => {
      const next = ROUND_SECONDS - Math.floor((Date.now() - started) / 1000);
      setLeft(next);
      if (next <= 0) {
        window.clearInterval(id);
        onExpireRef.current();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [active, roundKey]);

  return Math.max(0, left);
}
