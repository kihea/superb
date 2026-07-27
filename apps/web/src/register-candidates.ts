// A dev-only switch for choosing between built treatments of the reading
// screen while item 7 (the register choice, ADVISORY-012 Directive 2) is
// still open. This is not a product feature -- there is exactly one
// register once Kihea picks one (ADR-019, ADVISORY-008 §1) -- so it reads a
// URL query param instead of rendering any control a real reader could
// stumble onto. Delete this file the day the picker's job is done.
export type Candidate = "bare" | "drawn" | "inked";

const CANDIDATES: readonly Candidate[] = ["bare", "drawn", "inked"];

// "bare" -- today's merged screen (PR #31), no doodle presence at all -- is
// the default so every existing e2e assertion and preview link keeps
// behaving exactly as already shipped when no query param is present.
export function getCandidate(): Candidate {
  if (typeof window === "undefined") return "bare";
  const requested = new URLSearchParams(window.location.search).get("candidate");
  return (CANDIDATES as readonly string[]).includes(requested ?? "") ? (requested as Candidate) : "bare";
}
