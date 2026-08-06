// Whether the pointer or the keyboard is on a thing.
//
// The plates only move while somebody is looking at one, so nearly every
// component that holds a plate needs the same four handlers. Returned as
// props to spread, so a caller never wires three of them and forgets the
// keyboard one.
import { useState } from "react";

export function useLive() {
  const [live, setLive] = useState(false);
  const on = () => setLive(true);
  const off = () => setLive(false);
  return {
    live,
    liveProps: { onMouseEnter: on, onMouseLeave: off, onFocus: on, onBlur: off },
  };
}
