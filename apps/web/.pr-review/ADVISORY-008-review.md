# Review artifacts — ADVISORY-008, item 7's floor

Filed alongside the PR, per ADVISORY-008 §5 and the law-3 audit. This build
kills the picker (§1), meets the five-item floor, and applies the material
handed down in §2/§3. Screenshots referenced below are siblings of this file.

## Law-3 audit

Every string a reader can see on this screen, and the numbers-and-
congratulation check applied to each:

| String | Where | Measures the reader? |
|---|---|---|
| The passage text itself | `.passage-text` | No — the text's own prose. Content, not narration. |
| `— {author}, {work} ({year})` | `.passage-citation`, sourced excerpts only | No — a property of the text (ADR-023). No composed-pool equivalent invents an author. |
| `Keep reading →` | the one control | No — names an action, not an outcome (`superb-craft/references/language.md`). The arrow is decorative, not a count. |
| `Finding something to read.` | loading state | No — an empty-state invite, not a measurement. |
| `No engine wired up for a production build yet — T2's superb-wasm binding lands here.` | error state (dev-only; never in a production build) | No — an engineering note, not reader-facing pedagogy. |
| The gloss word, its definition, its "elsewhere" sentence | `.gloss-card` | No — a plain definition and a second usage, exactly what `gloss-interaction.md` specifies and nothing else (no pronunciation, no synonyms, no save-to-list). |

No progress bar, no percentage, no streak, no level, no score, no
congratulation, no review queue, anywhere. **Target words are never visually
marked**: every `.passage-word` is an identical unstyled button: no bold, no
colour, no underline, no dot. Confirmed by reading the CSS (`PassagePage.css`)
rather than trusted by memory.

## ADVISORY-008 §5's falsifier

**1. Named comparables, side by side, at real sizes.** Against a shadcn
dashboard default and a typical polished-SaaS marketing hero (the two
comparables named at dispatch):

- A shadcn card is a flat fill, a 1px `border-border` line, and a fixed
  `--radius`. This screen's card border is a 135°, three-stop gradient
  clipped to the border box only (`design/metal.css`) — it reads as a
  machined seam, not a CSS default, and no shadcn component ships that.
- A SaaS marketing hero's glass panel almost always floats over a static
  brand-colour blob or a stock photo. This screen's aura is two lights tuned
  to the app's own two accents (brass warm, `#8FD4E8` cool) and is *the
  ground itself* going still the moment a passage is on screen — not a
  looping hero animation, because nothing may move in the periphery while
  reading (ADR-019 as amended). A SaaS hero has no such constraint and
  usually keeps its blob animating everywhere, forever.
- Deficit against both comparables, named honestly: neither comparable has
  to solve "the reader must never see the app deciding anything," which is
  this screen's actual constraint and the reason it can't just borrow a
  denser SaaS layout (more chrome, more controls, more visible state) to
  compete on polish. The restraint is a cost against a SaaS reference on
  raw density, and a requirement against the product law.

**2. At least three choices that would be nonsense on another product.**

1. **The reading card is always a lit page, regardless of dark/light mode.**
   A SaaS app's dark mode inverts every surface; here the passage card
   stays the same warm parchment tone in both, because "dark mode is
   reading at night" means the room goes dark and the page stays lit
   (`design/tokens.json`, `--page-*` never varies with colour scheme). A
   generic product has no reason to hold one surface's colour scheme fixed
   against the system preference.
2. **The one accent (brass) only appears on hover/focus/press of the single
   control, never at rest.** A SaaS product puts its primary colour on the
   CTA at rest, because the CTA *wants* to be found. This app's control
   deliberately stays neutral until the reader's own attention lands on it —
   the accent is spent on the reader's action, not on drawing the eye
   toward a decision the app wants made.
3. **The aura is present but never animates.** Every comparable glass-UI
   reference (this build's own private prototype included,
   `workspace/prototypes/doodle-intake/`) drifts its ambient light
   continuously, because that reads as "alive." This screen's aura is
   static specifically because *this* screen is the reading state end to
   end, and ADR-019's amended seam says nothing in the periphery may move
   while a passage is on screen. A generic glassmorphism template has no
   reading state to protect and would never make this trade.
4. *(a fourth, past the floor of three)* The byline under sourced excerpts
   and its absence under composed ones is a deliberate, argued-for
   asymmetry (ADR-023) — most products either cite everything or nothing;
   this one cites exactly what has an author.

**3. Token uniformity, read from the diff.** `design/tokens.json`'s `chrome`
block is not a framework default: the ground hex (`#0C0F14` / `#EEF1F4`),
the aura opacities, and the three metal-edge gradient stops were chosen
against ADVISORY-008 §3's literal spec, not copied from a UI kit. Radius
varies across the three metal-treated surfaces (`--radius-slab` at desktop
width for the reading card, `--radius-lg` for the gloss card, `--radius-pill`
for the control) rather than reusing one value everywhere. Durations vary
by mass: `--motion-duration-slow` (460ms) for the passage's own arrival,
`--motion-duration-fast` (160ms) for its citation, `--motion-duration-beam`
(900ms, linear) for the gloss card's one-shot edge light — three different
numbers for three differently-sized events, not one duration reused
throughout.

**4. The seam audit while reading.** Automated as
`e2e/reading.spec.ts`'s `seam holds while reading` cases: with a passage on
screen, the aura's computed background-position and transform are read
twice, 500ms apart, in both colour schemes and with `prefers-reduced-motion`
both on and off. All four pass — nothing in the periphery is animating once
the two legitimate crossings (the passage's own arrival, the gloss card's
entrance and one-shot beam) have settled. Manually confirmed against the
screenshots in this folder: `dark-desktop.png`, `light-desktop.png`,
`dark-phone.png`, `light-phone.png`, `dark-desktop-reduced-motion.png`,
`dark-phone-gloss-open.png`, `dark-button-hover.png`.

## What this build does not claim

This is one screen's floor, not the M1.5 prototype finding ADR-006 still
asks for. The tokens say so in their own header. If the design loop circles
this floor for more than one or two circuits without converging, ADVISORY-008
already names the fallback: cut the floor to items 1 and 3 and ask Kihea
anyway.
