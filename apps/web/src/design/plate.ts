// A book's own generated mark.
//
// A library of whole books, and no artwork for any of them. The old answer was ten
// typographic jackets over five cloths, which meant a shelf row read as a
// paint chart and nothing told you what a book *was*. The new answer is a
// plate: a field of ASCII drawn from the title's hash, with the title's
// initials carved out of it in a 5x5 bitmap face. The field is drawn dim; the
// carved letters take the category's colour. Two books never read alike, even
// at 8px, and eleven colours are learnable in an afternoon.
//
// Colour is the category, not the book — that is the whole point. Within a
// category the plate still differs, because the field treatment, the carved
// letters and the gradient flag all come off the title's own hash.

export const ACCENT = "#C8564B";
export const INK = "#F2EEE7";

/** The eleven categories the library sorts on (superb-catalogue/library's
 *  CATEGORIES.md). A book's first category is its genre; anything after it is
 *  a set it was bundled into, which is information but not identity. */
export const KIND_HUE: Record<string, string> = {
  Fiction: "#C8564B",
  Adventure: "#BE8B3C",
  "Mystery & Horror": "#9A6FA0",
  "Fantasy & Science Fiction": "#6E9A94",
  "Comedy & Satire": "#D2A24A",
  "Children's": "#B5654A",
  Drama: "#7E9C6B",
  Poetry: "#8A7FC0",
  Philosophy: "#7E9C6B",
  Nonfiction: "#5F86A6",
  "Biography & Memoir": "#B39B72",
};

/** The second hue of a gradient title. Close enough to the first that the
 *  category still reads; far enough that the title looks hand-bound. */
const KIND_HUE_2: Record<string, string> = {
  Fiction: "#E0A36B",
  Adventure: "#D2C176",
  "Mystery & Horror": "#C87FA0",
  "Fantasy & Science Fiction": "#9AB6C4",
  "Comedy & Satire": "#E0C179",
  "Children's": "#D89A72",
  Drama: "#B7C08A",
  Poetry: "#C0A0D8",
  Philosophy: "#B7C08A",
  Nonfiction: "#7EA9A2",
  "Biography & Memoir": "#D6C7A4",
};

const FALLBACK_HUE = "#B39B72";

export function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export function kindHue(kind: string | undefined): string {
  return (kind && KIND_HUE[kind]) || FALLBACK_HUE;
}

export function kindHue2(kind: string | undefined): string {
  return (kind && KIND_HUE_2[kind]) || FALLBACK_HUE;
}

/** Every third title is set in a gradient rather than a flat hue — enough to
 *  make a wall of spines feel bound by hand, not enough to become a rainbow. */
export function isGradient(seed: string): boolean {
  return hash(seed) % 3 === 0;
}

/** How the carved letters are painted: flat category hue, or a gradient
 *  clipped to the glyphs. Returned as style properties so a caller can spread
 *  them onto the mark layer without knowing which it got. */
export function markPaint(seed: string, kind: string | undefined) {
  const a = kindHue(kind);
  const b = kindHue2(kind);
  if (!isGradient(seed)) return { color: a } as const;
  return {
    color: "transparent",
    backgroundImage: `linear-gradient(118deg, ${a} 0%, ${b} 62%, ${a} 100%)`,
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
  } as const;
}

export function dimOf(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ── the carving ─────────────────────────────────────────────────────── */

const RAMP = " .:-=+*#%@";

/** A 5x5 bitmap face, one row per byte, five bits used. Small enough that an
 *  8px plate still reads as letters rather than noise. */
const FONT5: Record<string, number[]> = {
  A: [14, 17, 31, 17, 17], B: [30, 17, 30, 17, 30], C: [15, 16, 16, 16, 15], D: [30, 17, 17, 17, 30],
  E: [31, 16, 30, 16, 31], F: [31, 16, 30, 16, 16], G: [15, 16, 19, 17, 15], H: [17, 17, 31, 17, 17],
  I: [31, 4, 4, 4, 31], J: [7, 2, 2, 18, 12], K: [17, 18, 28, 18, 17], L: [16, 16, 16, 16, 31],
  M: [17, 27, 21, 17, 17], N: [17, 25, 21, 19, 17], O: [14, 17, 17, 17, 14], P: [30, 17, 30, 16, 16],
  Q: [14, 17, 21, 18, 13], R: [30, 17, 30, 18, 17], S: [15, 16, 14, 1, 30], T: [31, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 14], V: [17, 17, 17, 10, 4], W: [17, 17, 21, 27, 17], X: [17, 10, 4, 10, 17],
  Y: [17, 10, 4, 4, 4], Z: [31, 2, 4, 8, 31],
};

const STOP = new Set(["the", "of", "a", "an", "and", "in", "on", "to", "from"]);

/** What gets carved. Small words are skipped so "The Voyage of the Beagle"
 *  carves VB rather than TV. */
export function initials(title: string): string {
  const words = title
    .replace(/[^A-Za-z ]/g, "")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w.toLowerCase()));
  if (words.length >= 2) return words.slice(0, 3).map((w) => w[0].toUpperCase()).join("");
  return (words[0] || title).slice(0, 3).toUpperCase();
}

/** Six field treatments, one per book by hash. `t` advances only while the
 *  plate is being looked at, so a plate breathes under the pointer and is
 *  perfectly still otherwise. */
function fieldValue(style: number, u: number, v: number, a: number, b: number, c: number, t: number): number {
  switch (style) {
    case 0: {
      // contour — nested rings, topographic
      const d = Math.hypot(u - 0.5 - (a - 0.5) * 0.5, (v - 0.5) * 1.6);
      return Math.sin(d * 26 - t * 1.6 + b * 6.3) * 0.5 + 0.5;
    }
    case 1: {
      // halftone — a lit corner falling away. The floor keeps the far corner
      // a field rather than a hole: at tile size, a treatment that reaches
      // zero reads as a card somebody forgot to finish.
      const d = Math.hypot(u - a, v - b);
      return 0.1 + Math.max(0, 1 - d * 1.5) * 0.9 + 0.18 * Math.sin(u * 30 + t);
    }
    case 2:
      // weave — orthogonal hatching
      return Math.sin(u * 34 + t) * Math.sin(v * 22 - t * 0.6) * 0.5 + 0.5;
    case 3: {
      // starfield — sparse, with one bright drift
      const n = Math.sin(u * 91.7 + b * 13.1) * Math.cos(v * 77.3 + a * 9.7);
      const cluster = Math.max(0, 1 - Math.hypot(u - c, v - a) * 2.6);
      // 0.14 rather than 0.06 between the stars: the ramp's first step is a
      // space, so a darker floor left whole tiles blank.
      return (n > 0.72 ? 0.9 : 0.14) + cluster * 0.5;
    }
    case 4: {
      // strata — sedimentary bands, faulted
      const fault = u > 0.3 + a * 0.4 ? 0.13 : 0;
      return Math.sin((v + fault) * 17 + b * 6.3 + t * 0.4) * 0.5 + 0.5;
    }
    default: {
      // bloom — a radial burst
      const ang = Math.atan2(v - 0.5, u - 0.5);
      const d = Math.hypot(u - 0.5, (v - 0.5) * 1.7);
      return Math.max(0, 1 - d * 1.8) * (0.55 + 0.45 * Math.sin(ang * (5 + ((a * 6) | 0)) + t));
    }
  }
}

/** How many letters actually fit: n of them take n*gw of glyph, (n-1)*gap
 *  between, and a column of margin each side. Getting this wrong by one gap
 *  is the difference between a card that carves two letters and one that
 *  carves a single letter with half the grid left empty beside it. */
function fit(letters: number, w: number, gw: number, gap: number): number {
  return Math.min(letters, Math.max(1, Math.floor((w - 2 + gap) / (gw + gap))));
}

/** Two layers of the same grid. The field is everything the letters are not;
 *  the mark is the letters alone. Drawn as two stacked <pre>s so the field can
 *  be dim and the letters can carry the category's colour — or its gradient,
 *  which needs real glyphs to clip to. */
export interface Plate {
  field: string;
  mark: string;
}

const EMPTY: Plate = { field: "", mark: "" };

/** The small plate: a mark beside a title, from 5 rows up to 16. */
export function plate(seed: string, w: number, h: number, phase = 0): Plate {
  if (w < 1 || h < 1) return EMPTY;
  const s = hash(seed);
  const style = s % 6;
  const a = (s % 97) / 97;
  const b = ((s >> 7) % 89) / 89;
  const c = ((s >> 13) % 83) / 83;
  const letters = initials(seed);

  const scale = h >= 14 ? 2 : 1;
  const gw = 5 * scale;
  const gh = 5 * scale;
  const gap = scale;
  const n = fit(letters.length, w, gw, gap);
  const blockW = n * gw + (n - 1) * gap;
  const ox = Math.floor((w - blockW) / 2);
  const oy = Math.floor((h - gh) / 2);

  const carved = carve(letters, n, w, h, ox, oy, gw, gh, gap, scale);
  return render(carved, style, a, b, c, phase, w, h, h, null);
}

/** The card plate: the art *is* the tile. The field fills the whole block, the
 *  title's first two letters are carved large and never move, and the rest of
 *  the title runs as a marquee along the foot — so a shelf reads as two big
 *  letters at rest and tells you the whole title when you look at it. */
export function plateCard(seed: string, w: number, h: number, phase = 0, running = false): Plate {
  if (w < 1 || h < 3) return EMPTY;
  const s = hash(seed);
  const style = s % 6;
  const a = (s % 97) / 97;
  const b = ((s >> 7) % 89) / 89;
  const c = ((s >> 13) % 83) / 83;
  const letters = initials(seed).slice(0, 2);

  const marqueeRow = h - 1;
  const bodyH = marqueeRow - 1;
  const scale = Math.max(1, Math.min(6, Math.floor(bodyH / 5)));
  const gw = 5 * scale;
  const gh = 5 * scale;
  const gap = scale;
  const n = fit(letters.length, w, gw, gap);
  const ox = 1;
  const oy = Math.max(0, Math.floor((bodyH - gh) / 2));

  const carved = carve(letters, n, w, h, ox, oy, gw, gh, gap, scale);
  const band = (seed.toUpperCase() + "   ·   ").repeat(Math.max(2, Math.ceil((w * 2) / (seed.length + 7))));
  const shift = running ? Math.floor(phase * 3) % band.length : 0;
  return render(carved, style, a, b, c, phase, w, h, bodyH, { row: marqueeRow, band, shift });
}

function carve(
  letters: string,
  n: number,
  w: number,
  h: number,
  ox: number,
  oy: number,
  gw: number,
  gh: number,
  gap: number,
  scale: number,
): boolean[][] {
  const mark: boolean[][] = [];
  for (let y = 0; y < h; y++) mark.push(new Array(w).fill(false));
  for (let i = 0; i < n; i++) {
    const rows = FONT5[letters[i]?.toUpperCase()] || FONT5.O;
    for (let y = 0; y < gh; y++) {
      const bits = rows[Math.floor(y / scale)];
      for (let x = 0; x < gw; x++) {
        if ((bits >> (4 - Math.floor(x / scale))) & 1) {
          const my = oy + y;
          const mx = ox + i * (gw + gap) + x;
          if (mark[my] && mx >= 0 && mx < w) mark[my][mx] = true;
        }
      }
    }
  }
  return mark;
}

function render(
  mark: boolean[][],
  style: number,
  a: number,
  b: number,
  c: number,
  t: number,
  w: number,
  h: number,
  bodyH: number,
  marquee: { row: number; band: string; shift: number } | null,
): Plate {
  const fieldRows: string[] = [];
  const markRows: string[] = [];
  for (let y = 0; y < h; y++) {
    let f = "";
    let m = "";
    for (let x = 0; x < w; x++) {
      if (marquee && y === marquee.row) {
        f += " ";
        m += marquee.band[(x + marquee.shift) % marquee.band.length] || " ";
        continue;
      }
      const val = Math.max(0, Math.min(0.999, fieldValue(style, x / w, y / bodyH, a, b, c, t)));
      const ch = RAMP[Math.floor(val * RAMP.length)];
      if (mark[y][x]) {
        f += " ";
        m += val > 0.52 ? "#" : "+";
      } else {
        f += ch;
        m += " ";
      }
    }
    fieldRows.push(f);
    markRows.push(m);
  }
  return { field: fieldRows.join("\n"), mark: markRows.join("\n") };
}

/* ── decrypt reveal ──────────────────────────────────────────────────────
   The landing's own trick, in the grid the app already speaks: characters
   resolve left to right out of a scramble. Used where something arrives
   rather than merely appears — a book you have just opened, a heading the
   landing is introducing. */

const SCRAMBLE = "!<>-_\\/[]{}=+*^?#%&";

export function decrypt(text: string, p: number): string {
  if (p >= 1) return text;
  if (p <= 0) p = 0;
  const n = Math.floor(text.length * p);
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (i < n || c === " ") out += c;
    else out += SCRAMBLE[(i * 7 + Math.floor(p * 53) + i) % SCRAMBLE.length];
  }
  return out;
}
