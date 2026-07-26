// The one thing that changes between the two embodiments this PR asks
// Kihea to look at side by side (workspace/tracks/T4-surface.md). Not an
// app setting -- there is no in-product switch, and there will not be one
// once this question is answered.
export type Register = "glass" | "paper";

export function isRegister(value: string | null): value is Register {
  return value === "glass" || value === "paper";
}
