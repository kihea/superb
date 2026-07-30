# apps/site

The public landing page (T9). A marketing surface beside the reading app,
not inside it — `apps/web`'s `index.html` is the reading app's shell, and law
3 (the app never narrates its own pedagogy) is why this page does not share
it. This surface may say plainly what Superb is (ADR-038); the reading app
still may not.

Static output, zero runtime dependencies, its own `package.json` — nothing
here can drag `apps/web`'s toolchain into a deploy.

## Running it

```sh
npm run build   # writes dist/
npm run check   # fails if a rendered device disagrees with its cited figure
npm run lint    # fails if a retired phrase reappears, or a citation goes missing
npm run test    # all three, in order
```

`dist/a/index.html` and `dist/b/index.html` are the two full candidate pages
— they differ only in which statistic opens "the case" section (issue #89).
`dist/index.html` is a labelled, side-by-side compare page for review; it is
not itself a candidate for publishing.

## Where the numbers come from

Every figure on the page lives once, in `data/figures.json`, tagged with what
kind of statement it is (ADR-038 Decision 1: a cited fact, a fact about the
product, a measurement we made, or — never — a result nobody has produced).
`scripts/build.mjs` reads that file to fill in copy and generate the squares
and ticks; `scripts/check-devices.mjs` re-parses the *built* HTML and counts
the rendered cells itself, rather than trusting anything the generator
reports about its own output. That is the check T9 job 4 asks for, and it is
meant to go red the day someone hand-edits a device without updating the
figure it illustrates, or the reverse.

The three figures the mockup shipped with did not survive contact with their
sources (ADR-038): the "sixth-grade level" gloss is not PIAAC's own language
and its own measuring body discourages it; no research supports a
minutes-per-session habit threshold, so the six-minute line is now a fact
about this product rather than a claim about habit formation in general; and
the words-per-year figure does not ship at all, in any form, because no
reader has used this product for a year. What replaced it is the mechanism —
a word you tap comes back until it's yours.

## Colour vs. layout

Colour comes from `design/tokens.json`'s `chrome.dark` palette, read at build
time (`src/tokens.mjs`) rather than hand-copied — if the brand palette moves,
this page moves with it. Layout, rhythm and the Geist type family keep the
mockup's own feel; `design/tokens.json` names Inter and Source Serif for the
reading app's chrome and passage, not for this surface, so the two type
choices are deliberately not reconciled here (T9 job 6: brand palette wins on
colour, the mockup wins on layout and typographic feel).

The mockup's three-hue stat cards (an oxblood/sage/lilac triad) do not
survive `chrome`'s own stated rule — "one warm accent (brass) carries every
action... the cool tone appears only inside edge-light gradients, never as an
accent" — so all three stat cards use the one accent, at full and reduced
weight, instead of three colours.
