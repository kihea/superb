# Review artifacts — ADVISORY-008, item 7's floor

Filed alongside the PR. Screenshots are the siblings of this file pinned at
commit `7f80e62`, unaffected by the correction below.

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

This audit is mine to file — it is a check of what was built against a fixed
law, not a judgment call about whether the result is good.

## Self-assessment against ADVISORY-008 §5 — not the falsifier

**Correction, filed after the fact:** the section below was originally
labelled as the §5 falsifier itself. It is not, and law 6 (the verifier is
never the producer) means it cannot be — a producer nominating its own three
"only makes sense here" choices is precisely the assessment §5 exists to
replace. This is a self-assessment: my own honest attempt at the same four
checks, offered as evidence and a record of my own reasoning, not as the
artifact §5 calls for. **The actual falsifier is a separate, independent
review, filed by a context that did not build these screens**, and it is
pending as of this commit — it may reach different comparables, find fewer
than three choices that survive scrutiny, or disagree with the token read
below. Nothing here should be read as pre-empting or standing in for that
review.

With that label corrected, my own attempt at the four items, left as stated
rather than softened:

1. **Named comparables, side by side, at real sizes.** Against a shadcn
   dashboard default and a typical polished-SaaS marketing hero (the two
   comparables named at dispatch):
   - A shadcn card is a flat fill, a 1px `border-border` line, and a fixed
     `--radius`. This screen's card border is a 135°, three-stop gradient
     clipped to the border box only (`design/metal.css`) — it reads as a
     machined seam, not a CSS default, and no shadcn component ships that.
   - A SaaS marketing hero's glass panel almost always floats over a static
     brand-colour blob or a stock photo. This screen's aura is two lights
     tuned to the app's own two accents (brass warm, `#8FD4E8` cool) and is
     *the ground itself* going still the moment a passage is on screen —
     not a looping hero animation, because nothing may move in the
     periphery while reading (ADR-019 as amended). A SaaS hero has no such
     constraint and usually keeps its blob animating everywhere, forever.
   - Deficit against both comparables, named honestly: neither comparable
     has to solve "the reader must never see the app deciding anything,"
     which is this screen's actual constraint and the reason it can't just
     borrow a denser SaaS layout (more chrome, more controls, more visible
     state) to compete on polish.

2. **At least three choices that would be nonsense on another product.**
   1. The reading card is always a lit page, regardless of dark/light mode
      (`design/tokens.json`'s `--page-*` never varies with colour scheme) —
      a generic dark mode inverts every surface.
   2. The one accent (brass) only appears on hover/focus/press of the
      single control, never at rest — a SaaS product puts its primary
      colour on the CTA at rest, because the CTA wants to be found; this
      app's control deliberately stays neutral until the reader's own
      attention lands on it.
   3. The aura is present but never animates — every comparable glass-UI
      reference (this build's own private prototype included) drifts its
      ambient light continuously; this screen's aura is static specifically
      because it is the reading state end to end.
   4. *(a fourth, past the floor of three)* The byline under sourced
      excerpts and its absence under composed ones is a deliberate,
      argued-for asymmetry (ADR-023) — most products either cite everything
      or nothing.

3. **Token uniformity, read from the diff.** `design/tokens.json`'s `chrome`
   block was chosen against ADVISORY-008 §3's literal spec, not copied from
   a UI kit. Radius varies across the three metal-treated surfaces
   (`--radius-slab`, `--radius-lg`, `--radius-pill`) rather than reusing one
   value everywhere. Durations vary by mass: 460ms for the passage's own
   arrival, 160ms for its citation, 900ms linear for the gloss card's
   one-shot edge light.

4. **The seam audit while reading.** Automated as `e2e/reading.spec.ts`'s
   `seam holds while reading` cases: with a passage on screen, the aura's
   computed background-position and transform are read twice, 500ms apart,
   in both colour schemes and with `prefers-reduced-motion` both on and
   off. All four pass. Manually confirmed against the screenshots in this
   folder.

## What this build does not claim

This is one screen's floor, not the M1.5 prototype finding ADR-006 still
asks for. If the design loop circles this floor for more than one or two
circuits without converging, ADVISORY-008 already names the fallback: cut
the floor to items 1 and 3 and ask Kihea anyway.
