# Superb — design system

**Superb** is a vocabulary and language-strengthening product whose whole gimmick is that it
makes people *read*. Words are learned in place, inside something worth finishing, as a response
to the literacy crisis — not from decks of flashcards. Everything in this system should feel like
paper, ink and a good pen: warm, hand-touched, quiet, and legible above all.

## Sources given

| Source | What it contained | Status |
| --- | --- | --- |
| `uploads/Superb Identity.dc.html` | The saved brand identity: three themes (Oxblood *primary*, Lilac Ink *secondary*, Glacier *tertiary*), each with a light and dark specimen, five-swatch ramps, the wordmark in Shantell Sans Bold, the three-stroke mark at -33°, app-tile treatments, and Sono as the UI face. | Read in full; it is the ground truth for this system. |
| Company description (chat) | "Superb is a vocabulary building and linguistic strengthening tool. Gimmick is getting people to read to address the literacy crisis. Oxblood primary and secondary/3rd are in the uploaded file." | Used for product framing and voice. |

No codebase, Figma file, product screens, deck, photography or illustration was provided. Anything
below that is not derived from those two sources is flagged in place as an assumption. **The
identity file wins over anything in this readme if they ever disagree.**

## Index

| Path | What |
| --- | --- |
| `styles.css` | The single entry point consumers link. `@import` list only. |
| `tokens/` | `fonts.css` `colors.css` `typography.css` `spacing.css` `radius.css` `elevation.css` `motion.css` `base.css` |
| `components/core/` | Logo, Button, IconButton, Card, Badge, Tag, Icon |
| `components/forms/` | Input, Select, Checkbox, Radio, Switch |
| `components/feedback/` | ProgressBar, Toast, Tooltip, Dialog |
| `components/navigation/` | Tabs |
| `ui_kits/app/` | The reading app: Today, Reader (+ word sheet), Word bank, You. Click-through. |
| `ui_kits/web/` | Marketing home page: hero, how-it-works, mission band, library, pricing, footer. |
| `guidelines/` | Foundation specimen cards (Colors, Type, Spacing, Brand groups). |
| `assets/` | `mark-*.svg` (the three-stroke mark) and `appicon-*.svg` (per-theme tiles). |
| `SKILL.md` | Agent-skill wrapper so this folder works inside Claude Code. |
| `thumbnail.html` | Homepage tile. |

Every component has a sibling `.d.ts` (props contract) and `.prompt.md` (what & when, plus a usage
example). Read the `.prompt.md` before using a component; it carries the rules that the props can't.

### Components
Badge · Button · Card · Checkbox · Dialog · Icon · IconButton · Input · Logo · ProgressBar · Radio · Select · Switch · Tabs · Tag · Toast · Tooltip

### Intentional additions
The identity file defines no component inventory, so the standard primitive set above was authored
from scratch. Three of them exist for Superb-specific reasons:

- **Logo** — the lockup has fiddly geometry (mark at -33° about its lower-left, positioned off the
  "u"). A component stops everyone re-deriving it.
- **Icon** — Superb has no glyph set of its own, so this wraps Lucide (see *Iconography*).
- **ProgressBar** — reading and mastery progress are the product's core feedback; a bare div wasn't
  going to stay consistent.

---

## Content fundamentals

**Voice: a well-read friend who is not impressed by tests.** Warm, dry, specific. Confident enough
to be brief. It never sounds like an ed-tech dashboard and never sounds like a motivational app.

- **Person.** Second person for instructions and value ("you", "your words"). First-person plural
  only for things Superb itself does ("we'll keep your place"). Never "I".
- **Casing.** Sentence case everywhere: headlines, buttons, labels, nav, tabs. The only uppercase is
  the eyebrow/label style, which is uppercase *plus* `--ls-eyebrow` tracking — that's a typographic
  device, not shouting. Never Title Case A Headline Like This.
- **Punctuation.** Headlines may end in a full stop ("Nobody ever learned a word from a list.").
  Buttons and labels never do. Em dashes and semicolons are welcome — this is a literacy product and
  its punctuation should demonstrate range. Curly quotes and apostrophes always (’ “ ”).
- **Numbers.** Numerals for anything countable ("6 minutes", "1,284 words", "Day 41"); spelled out
  when it's rhetoric ("three moves"). Streaks are stated plainly, never with rockets or fireworks.
- **Length.** Headline ≤ 9 words. Body paragraph ≤ 3 sentences. Definitions ≤ 12 words. Empty states
  are one sentence and tell you the next action ("Nothing here yet. Read something and tap a word.")
- **Verbs.** Buttons are verb-first and concrete: *Keep the word*, *Keep reading*, *Hear it*,
  *Start with six minutes*. Not *Submit*, *Learn more*, *Get started*.
- **No gamification vocabulary.** No XP, levels, badges-as-rewards, leaderboards, "crush it",
  "level up". Streaks exist because habit is the mechanism, and the copy stays low-key about them:
  "Six minutes today keeps it alive."
- **No emoji. Ever.** Not in UI, not in marketing, not in notifications. Icons or nothing.
- **Vocabulary about vocabulary.** Words are *kept*, not "saved" or "collected". Reading is *the
  intervention*. A word you've learned is *yours*.

Examples in the right register:

> Nobody ever learned a word from a list.
> Six minutes today keeps it alive.
> Tap what trips you up.
> It comes back until it's yours.
> Free while you're building the habit. No streak guilt, no leaderboards.
> That address looks incomplete.

And the wrong register: "Congrats! 🎉 You've unlocked Level 4 Word Master!"

---

## Visual foundations

### Colour
Three complete themes, each with a night mode. **Oxblood is primary and is the default**; Lilac Ink
and Glacier are alternates ("paper" choices), not decoration — never mix two themes in one view.
Structure per theme: warm/cool paper, a deeper paper for sunken areas, one saturated brand accent,
one support accent, one near-black ink. Semantic aliases (`--surface-*`, `--text-1..3`, `--brand*`,
`--support*`, `--border-*`) are what product code touches; raw ramps (`--ox-red`, `--li-violet`) exist
for specimens and edge cases.

- Oxblood: paper `#F6EFE4`, brand `#9B3B3B`, support sage `#6F8367`, ink `#2E231C`.
- Lilac Ink: paper `#EEECF2`, brand `#7B52C9`, support mint `#3FAE8B`, ink `#1D1A26`.
- Glacier: paper `#E9EFF1`, brand `#0E8FA8`, support indigo `#7A6BD6`, ink `#15222A`.
- Dark modes lighten the accent (`#D96A63`, `#B193F5`, `#3FC4DD`) and take text to the theme's cream.
- Colour is never the only signal: state also changes weight, icon or label.
- Large brand fills are for one thing at a time — the primary button, one hero panel, the app tile.
  Everything else is paper, ink and hairlines.

### Type
Two faces plus one reading face. **Shantell Sans Bold** (display) carries the wordmark, headlines and
big numbers — it is the hand in the brand, and it is never used for body copy or anything under
~17px. **Sono** (a soft monospace) is the entire UI voice: labels, buttons, captions, list rows,
counts; its even widths keep numbers aligned without tabular hacks. **Literata** sets long-form
passages at 17–20px / 1.65 with a 66ch measure. Tracking: `-.01em` on display, `0` on UI,
`.14em` on uppercase eyebrows. One composite `--type-*` token per role; don't hand-assemble stacks.

### Space & layout
4px-rooted scale that loosens as it climbs (2 · 4 · 6 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80 · 112).
Card padding 20px, stack gap 12px, control gap 8px, section rhythm 80px. Content max 1080px, shell
max 1240px, reading measure 66ch. Mobile: 20px page gutters, 44px minimum hit target, bottom tab bar
fixed, everything else scrolls. Desktop: sticky translucent header; nothing else is fixed.

### Surfaces, borders, radii
Cards are **paper on paper**: `--surface-card` (a warm near-white), a 1px hairline at 9% ink, 10px
radius, and `--shadow-1` — barely there. Radii: 4 (chips) · 6 (controls) · 10 (cards, the default)
· 14 (sheets) · 24 (modals, app tiles) · 32 (device) · pill (tags and progress tracks only). App
tiles use radius = 25% of the square. No colored left borders, no gradients, no glassmorphism panels.

### Shadows & elevation
Three steps, all warm — shadow colour is the theme's ink, never black: `--shadow-1` resting cards,
`--shadow-2` hover and popovers, `--shadow-3` sheets, modals and toasts. Depth comes from the
hairline first and the shadow second. `--shadow-press` (inset) is available but rarely needed.

### Interaction states
- **Hover:** fills darken one step (`--brand-hover`); quiet/secondary controls pick up
  `--surface-sunken`; cards marked `interactive` lift 1px and go `--shadow-2`; links go
  `--brand-hover` and their underline goes full-opacity.
- **Press:** darken again (`--brand-press`) *and* scale to `.98`. That tiny squash is the brand's
  one piece of playfulness.
- **Focus:** `--ring-focus` — a 2px paper gap then a 2px `--focus` ring. Inputs instead paint the
  border `--brand` with a 3px `--highlight` glow.
- **Selected:** filled brand (Tag), 2px brand underline (Tabs), brand border + shadow (choice cards).
- **Disabled:** 42% opacity, no colour change, `not-allowed` cursor.

### Motion
Short and unshowy: 120ms for colour, 180ms for small transforms, 280ms for sheets and progress,
420ms only for a full-screen transition. `--ease-out` `cubic-bezier(.2,.8,.25,1)` for nearly
everything; `--ease-spring` `cubic-bezier(.34,1.4,.64,1)` **only** for the Switch knob. Sheets rise
from the bottom edge; toasts rise 6px and fade; tooltips fade only. No bounce on page content, no
parallax, no scroll-jacking, no confetti — ever, including on streak milestones. All durations
collapse to 0 under `prefers-reduced-motion`.

### Transparency & blur
Two sanctioned uses: the sticky site header (paper at 88% + `--blur-sheet`) and the modal/sheet scrim
(`--scrim`, ink at 48%, + `--blur-sheet`). Nothing else is translucent — no frosted cards, no
tinted overlays on imagery.

### Imagery
**None was provided.** Where art would go, this system uses flat brand or brand-soft panels with type
(see the app's passage card and the library covers), and says so in the UI. When real imagery
arrives it should read like good editorial: warm, slightly desaturated, natural light, visible grain
welcome; no cool blue tech gradients, no stock smiling-at-laptop. Any text over imagery needs a
solid capsule, not a protection gradient — this brand prefers a hard edge to a fade.

### The word highlight
The signature graphic device is not a shape, it's a **highlighted word inside running text**:
`--highlight` (brand at 16%) behind the word, 4px radius, 3px horizontal padding, no underline, no
colour change to the glyphs. `--support-soft` marks a word already mastered. Everything about the
product should be one tap away from that gesture.

---

## Iconography

- **No proprietary icon set was provided.** Superb's only owned mark is the three-stroke logo mark.
- **Substitution (flagged):** icons are **Lucide** — 24px grid, ~1.75–2px stroke, round caps, no
  fills — fetched from `cdn.jsdelivr.net/npm/lucide-static@0.525.0` and inlined at render so every
  glyph inherits `currentColor`. Always go through `<Icon name="…"/>`. If Superb has, or
  wants, a hand-drawn icon set to match Shantell Sans, this is the first thing to replace.
- **Sizes:** 16 (inline with body text), 20 (default: buttons, list rows), 24 (nav, headers). Icons
  are decorative by default (`aria-hidden`) unless given a `title`.
- **Vocabulary in use:** `book-open` (read), `bookmark` (keep a word), `flame` (streak),
  `volume-2` (read aloud), `repeat` (review), `check` (mastered), `search`, `chevron-*`, `x`,
  `type` (text settings), `clock`, `mail`, `log-out`.
- **Never:** emoji, unicode symbols as icons (✓ ★ →), filled/duotone glyph mixes, or a second icon
  family alongside Lucide.
- **The mark is not an icon.** `assets/mark-*.svg` and `assets/appicon-*.svg` are brand assets; don't
  drop the mark inline in UI as decoration.

---

## Fonts — action needed

All three faces are Google Fonts and are loaded by `@import` in `tokens/fonts.css`; **no font
binaries were provided, so none are vendored here.**

- **Shantell Sans** and **Sono** come straight from the identity file — correct, not substitutions.
- **Literata** *is* a substitution: the identity defines no reading face, and Sono (monospace) is
  wrong for long passages, which is the one thing this product must get right. Literata is a
  screen-reading serif with real range. If Superb already licenses a reading face, swap
  `--font-read` and `tokens/fonts.css`.

**Please send:** licensed `.woff2` files for the three faces (or confirmation that Google Fonts
hosting is fine), and a yes/no on Literata as the reading face.

## Known gaps
Logo files (the wordmark is rendered live in type — no vector lockup was provided), photography and
illustration, real passage content and licensing, cited literacy statistics, an icon set of Superb's
own, and any real product screens. The two UI kits are proposals built from the identity, not
recreations of shipped screens.
