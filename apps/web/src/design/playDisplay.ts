// The three practices, drawn as what they are rather than labelled.
//
// The audit's sixth finding: the room where the app is supposed to be fun was
// the flattest one in it — three identical rounded cards distinguished only by
// the words on them. A card that says "Association" tells you nothing a menu
// item wouldn't; worse, at a glance the carved initials read as ASS.
//
// So each practice gets a display instead of a name: a moving picture of what
// the exercise actually does. Rhyme is two waveforms drifting into phase —
// the tails matching is the game. Association is one node with pulses running
// out along its spokes. Prose is a page resolving out of noise, which is what
// a composed passage is. They run across the full width of their tile, and
// they are always alive, because this is the one room that should never look
// asleep.

export type Practice = "rhyme" | "association" | "prose";

/** One hue each, drawn from the same eleven-colour language the shelf uses,
 *  so Play does not read as a different product from the Library. */
export const PRACTICE_HUE: Record<Practice, string> = {
  rhyme: "#BE8B3C",
  association: "#5F86A6",
  prose: "#8A7FC0",
};

const SCRAMBLE = "!<>-_\\/[]{}=+*^?#%&";

export function playDisplay(kind: Practice, w: number, h: number, t: number): string {
  if (w < 1 || h < 1) return "";
  const rows: string[][] = [];

  if (kind === "rhyme") {
    // Two waveforms, one lagging, closing on each other from left to right.
    // Where they land on the same row the character doubles up — the rhyme.
    for (let y = 0; y < h; y++) rows.push(new Array(w).fill(" "));
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const lock = Math.min(1, u * 1.5);
      const y1 = Math.round((h - 1) * (0.5 + 0.34 * Math.sin(u * 9 + t)));
      const y2 = Math.round((h - 1) * (0.5 + 0.34 * Math.sin(u * 9 + t + (1 - lock) * 2.4)));
      rows[clamp(y1, h)][x] = "=";
      rows[clamp(y2, h)][x] = y1 === y2 ? "#" : "-";
    }
  } else if (kind === "association") {
    // One node, spokes reaching out, a pulse running down each of them.
    for (let y = 0; y < h; y++) rows.push(new Array(w).fill(" "));
    const cx = w * 0.28;
    const cy = (h - 1) / 2;
    for (let k = 0; k < 7; k++) {
      const ang = (k / 7) * Math.PI * 2 + t * 0.18;
      const len = w * 0.42 * (0.55 + 0.45 * Math.sin(k * 2.1 + t));
      for (let d = 2; d < len; d++) {
        const x = Math.round(cx + Math.cos(ang) * d);
        const y = Math.round(cy + Math.sin(ang) * d * 0.48);
        if (x < 0 || x >= w || y < 0 || y >= h) continue;
        const pulse = Math.abs(((t * 7 + k * 3) % len) - d) < 1.2;
        rows[y][x] = pulse ? "@" : d > len - 2 ? "o" : "·";
      }
    }
    rows[clamp(Math.round(cy), h)][clamp(Math.round(cx), w)] = "#";
  } else {
    // A page arriving: lines settling out of a scramble, left to right.
    const p = Math.sin(t * 0.5) * 0.5 + 0.5;
    for (let y = 0; y < h; y++) {
      const row: string[] = [];
      const lineLen = y === h - 1 ? Math.floor(w * 0.55) : w - (y % 3);
      for (let x = 0; x < w; x++) {
        if (x >= lineLen) {
          row.push(" ");
          continue;
        }
        const settled = x / lineLen < p + y * 0.04;
        row.push(settled ? (x % 7 === 6 ? " " : "=") : SCRAMBLE[(x * 5 + y * 3 + Math.floor(t * 9)) % SCRAMBLE.length]);
      }
      rows.push(row);
    }
  }

  return rows.map((r) => r.join("")).join("\n");
}

function clamp(n: number, of: number): number {
  return Math.max(0, Math.min(of - 1, n));
}
