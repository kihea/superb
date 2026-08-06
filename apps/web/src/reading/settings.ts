// How the page is set.
//
// The three interchangeable app themes are gone — a brand cannot be a
// preference. What survives is everything that belongs to reading rather than
// to identity: the paper under the words, their size, their leading, whether
// the measure is justified, whether the page ahead dims, and whether being
// read to turns the page for you.
//
// All of it lives on <html> as data attributes, so design/night.css can
// answer with plain CSS and the reader's choice survives a reload.
import { useCallback, useEffect, useState } from "react";

export type Paper = "night" | "sepia" | "slate";
export type Size = "small" | "medium" | "large";
export type Lead = "tight" | "normal" | "open";

export const PAPERS: { id: Paper; label: string }[] = [
  { id: "night", label: "Night" },
  { id: "sepia", label: "Sepia" },
  { id: "slate", label: "Slate" },
];

export const SIZES: Record<Size, { px: number; label: string }> = {
  small: { px: 17, label: "Small" },
  medium: { px: 19, label: "Medium" },
  large: { px: 22, label: "Large" },
};

export const LEADS: Record<Lead, { value: number; label: string }> = {
  tight: { value: 1.5, label: "Tight" },
  normal: { value: 1.65, label: "Normal" },
  open: { value: 1.85, label: "Open" },
};

export interface PageSettings {
  paper: Paper;
  size: Size;
  lead: Lead;
  justify: boolean;
  focus: boolean;
  followPage: boolean;
}

const DEFAULTS: PageSettings = {
  paper: "night",
  size: "medium",
  lead: "normal",
  justify: true,
  focus: false,
  followPage: true,
};

const KEY = "superb.page";

function read(): PageSettings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const stored = JSON.parse(raw) as Partial<PageSettings>;
    return {
      paper: PAPERS.some((p) => p.id === stored.paper) ? (stored.paper as Paper) : DEFAULTS.paper,
      size: stored.size && stored.size in SIZES ? stored.size : DEFAULTS.size,
      lead: stored.lead && stored.lead in LEADS ? stored.lead : DEFAULTS.lead,
      justify: typeof stored.justify === "boolean" ? stored.justify : DEFAULTS.justify,
      focus: typeof stored.focus === "boolean" ? stored.focus : DEFAULTS.focus,
      followPage: typeof stored.followPage === "boolean" ? stored.followPage : DEFAULTS.followPage,
    };
  } catch {
    // Private browsing, or a key someone hand-edited. The defaults are a
    // perfectly good page.
    return DEFAULTS;
  }
}

// One copy for the whole app, so the reader and Settings are never showing
// each other's stale state. Subscribers are notified on every change.
let current: PageSettings = typeof window === "undefined" ? DEFAULTS : read();
const listeners = new Set<(s: PageSettings) => void>();

function apply(next: PageSettings): void {
  current = next;
  if (typeof document !== "undefined") document.documentElement.dataset.paper = next.paper;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // The choice still holds for this session.
  }
  for (const listener of listeners) listener(next);
}

export function usePageSettings() {
  const [settings, setSettings] = useState<PageSettings>(current);

  useEffect(() => {
    listeners.add(setSettings);
    // The attribute may not be on <html> yet on a first mount.
    document.documentElement.dataset.paper = current.paper;
    setSettings(current);
    return () => {
      listeners.delete(setSettings);
    };
  }, []);

  const set = useCallback(<K extends keyof PageSettings>(key: K, value: PageSettings[K]) => {
    apply({ ...current, [key]: value });
  }, []);

  return { settings, set };
}
