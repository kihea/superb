// Whether chrome pinned to the screen's edges should be out of the way
// right now. Scrolling down is reading; the nav leaves. Scrolling up is
// looking for the door; it comes back. At the very top it is always there.
import { useEffect, useRef, useState } from "react";

// Enough travel that a rubber-band wiggle doesn't flicker the bars.
const THRESHOLD = 14;

export function useHideOnScroll(): boolean {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const accum = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    function onScroll() {
      const y = window.scrollY;
      const delta = y - lastY.current;
      lastY.current = y;
      if (y <= 24) {
        accum.current = 0;
        setHidden(false);
        return;
      }
      // Direction change resets the tally so one long slow scroll and one
      // quick flick behave the same.
      if ((delta > 0) !== (accum.current > 0)) accum.current = 0;
      accum.current += delta;
      if (accum.current > THRESHOLD) setHidden(true);
      else if (accum.current < -THRESHOLD) setHidden(false);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return hidden;
}
