// Which paper, and whether it is lit. Two independent choices, both made in
// Settings (1u) and both written onto <html> where design/ox.css reads them.
// Left alone, the app follows the system for light and dark, which is what
// it did before this track and what a reader who never opens Settings
// expects.
import { useEffect, useState } from "react";

export type Paper = "oxblood" | "lilac" | "glacier";
export type Night = "system" | "on" | "off";

const PAPER_KEY = "superb.paper";
const NIGHT_KEY = "superb.night";

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const stored = window.localStorage.getItem(key) as T | null;
    return stored && allowed.includes(stored) ? stored : fallback;
  } catch {
    // Private browsing, or storage disabled. The default is a fine answer.
    return fallback;
  }
}

export function applyTheme(paper: Paper, night: Night): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", paper);
  if (night === "system") root.removeAttribute("data-night");
  else root.setAttribute("data-night", night);
}

export function useTheme() {
  const [paper, setPaper] = useState<Paper>(() => read(PAPER_KEY, ["oxblood", "lilac", "glacier"], "oxblood"));
  const [night, setNight] = useState<Night>(() => read(NIGHT_KEY, ["system", "on", "off"], "system"));

  useEffect(() => {
    applyTheme(paper, night);
    try {
      window.localStorage.setItem(PAPER_KEY, paper);
      window.localStorage.setItem(NIGHT_KEY, night);
    } catch {
      // Nothing to do; the choice still holds for this session.
    }
  }, [paper, night]);

  return { paper, night, setPaper, setNight };
}
