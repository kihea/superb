# apps/site

The public landing page (T9). A marketing surface beside the reading app,
not inside it — `apps/web`'s `index.html` is the reading app's shell, and law
3 (the app never narrates its own pedagogy) is why this page does not share
it. This surface may say plainly what Superb is (ADR-038); the reading app
still may not.

Static output, zero runtime dependencies, its own `package.json` — nothing
here can drag `apps/web`'s toolchain into `npm run build`, `check`, `lint` or
`test`. `npm run assemble` is the one exception (T10 job 1): it builds
`apps/web` too, on purpose, because the two apps ship as one deployable —
see "The assembled deployable" below.

It deploys to `https://superb.works`. Registering and pointing that domain is
Kihea's own action, not this repo's — there is no CNAME file, DNS config, or
hosting-provider setup here, and none should be added on the assumption that
one is missing.

## Running it

```sh
npm run build   # writes dist/ -- this page alone, at "/"
npm run check   # fails if a rendered device disagrees with its cited figure
npm run lint    # fails if a retired phrase reappears, or a citation goes missing
npm run test    # typecheck, then all three, in order

npm run assemble  # builds this page into dist/, apps/web into dist/read/
npm run smoke     # serves dist/ and opens both / and /read/ in a real browser
```

One page, `dist/index.html`. This used to build two candidate pages plus a
compare view while the opening statistic in "the case" section was still
Kihea's open call (issue #89); he settled it on the criterion of "true and
accurate," so there is one page now, and this build no longer knows what a
variant is.

## The assembled deployable

T10 job 1: `superb.works` carries "everything web related" from one Cloudflare
Pages project, not two — the landing at `/`, the reading app at `/read/`.
`scripts/assemble.mjs` builds each app with its own toolchain (this page never
learns `apps/web`'s), then copies `apps/web/dist` into `dist/read/`. The
subpath is one constant: `apps/web/vite.config.ts`'s `BASE`, set to `/read/`
via the `VITE_BASE` env var when `assemble.mjs` calls `apps/web`'s own build,
and left at `/` for `apps/web`'s own standalone dev, build and CI. Change
where the app lives by changing that one constant; nothing else needs to
know, including `apps/web/src/content/store.ts`'s content fetches, which read
the same value back at runtime via `import.meta.env.BASE_URL`.

`scripts/check-assembled.mjs` (`npm run smoke`) is the check T10 job 4 asks
for: it serves the *assembled* `dist/` over http and opens both `/` and
`/read/` in a real browser, failing if the landing's nav is missing or has a
dead link, or if the app at `/read/` never reaches its first painted reading
surface (`article.passage-page`). `.github/workflows/site.yml`'s `check` job
runs `assemble` then `smoke` on every push and PR; `deploy` runs `assemble`
again before publishing, so what ships is always what the smoke check just
proved works.

## Where the numbers come from

Every figure on the page lives once, in `data/figures.json`, tagged with what
kind of statement it is (ADR-038 Decision 1: a cited fact, a fact about the
product, a measurement we made, or — never — a result nobody has produced).
`scripts/build.mjs` reads that file to fill in copy and generate the squares
and ticks; `scripts/check-devices.mjs` re-parses the *built* HTML and counts
the rendered cells itself, rather than trusting anything the generator
reports about its own output. That is the check T9 job 4 asks for, and it is
meant to go red the day someone hand-edits a device without updating the
figure it illustrates, or the reverse — it has been watched red both ways:
by editing the built HTML directly, and by editing `figures.json` without
rebuilding.

The three figures the mockup shipped with did not survive contact with their
sources (ADR-038): no research supports a minutes-per-session habit
threshold, so the six-minute line is a fact about this product rather than a
claim about habit formation in general; and the words-per-year figure does
not ship at all, in any form, because no reader has used this product for a
year. What replaced it is the mechanism — a word you tap comes back until
it's yours.

The opening statistic (ADR-038 Amendment 1) is NCES's own published PIAAC
result: 48% of US adults aged 16–65 reach Level 3 or above in literacy —
described here as holding meaning together across a longer piece of writing,
which is a plain-language rendering of NCES's own wording ("construct
meaning across larger chunks of text or perform multi-step operations"),
checked directly against `nces.ed.gov/surveys/piaac/measure.asp` rather than
against an earlier draft's paraphrase of it. That earlier draft
("compare, contrast and reason about what they have read") turned out not to
be NCES's language either — the second time this page's copy needed
correcting against a primary source rather than a plausible-sounding
restatement of one.

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
