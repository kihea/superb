# Superb

A vocabulary app that never admits it's teaching.

You open it and read. Words you don't know acquire meaning through informative
context and quiet resurfacing, until reading them produces automatic
understanding. Adaptive assessment, spaced repetition, and retrieval practice
run continuously underneath, and none of it is ever on screen. There is no
review queue, no streak, no level, no score.

**The design law:** the schedule is the pedagogy; the surface is the
experience. Any feature that requires explaining itself to the user is wrong
by definition.

## Status

Early, and moving. The engine — word state, scheduler, ability estimate,
passage composer — is built and proven by simulation before any interface
uses it, which is deliberate: the scheduling behaviour is the product, and it
is provable without a screen. A first reading screen now exists on the web,
wired directly to the real, compiled engine. Nothing you see there yet is a
finished product screen.

## Shape

One pure Rust engine, three thin shells, no server.

- `crates/superb-core` — the engine. Word state machine, scheduler, ability
  estimator, passage composer. Pure: no clock, no RNG, no I/O. `now` and seeds
  are parameters. This is the primary artifact, built as one library so all
  three shells can eventually run from the same decisions rather than three
  reimplementations of them. It compiles to WebAssembly for the web app,
  which exists today; Android and iOS binding to it is intended, not built
  yet.
- `crates/superb-sim` — headless simulator. Synthetic learners with known
  vocabularies, run over many sessions to prove the schedule converges.
- `apps/web` — React + Vite PWA. First platform, and the only one with code
  in the repository so far.
- `apps/android` — Jetpack Compose. Second.
- `apps/ios` — SwiftUI. Third.
- `data/` + `content/` — reference corpora, the composed passage library, and
  cited excerpts from public-domain literature. Every file is licence-audited
  by CI; every excerpt carries a complete citation.

A shell may render, gesture, persist, and time. It may not decide. Anything
that decides lives in the core, so all three platforms behave identically by
construction rather than by discipline.

Everything runs on-device and offline. Nothing leaves the device. Account sync,
when it arrives, will be free and optional — the paid tier is cloud voice and
hosted AI, never the ability to own two devices.

## Building

```sh
cargo test -p superb-core     # the engine and its property tests
```

```sh
cd apps/web && npm install && npm run dev     # the web reading screen
```

More arrives as the milestones do.

## Licensing

<!-- LICENCE-CLAIMS:START -->
**Code is source-available: MIT + Commons Clause. Content is CC0 where we wrote
it, and carries its own terms where we didn't.**

You may read the code, run it, change it, and pass it on — including changed
versions — as long as it is free. You may not sell it, or sell a product or
service whose value comes substantially from it. That one restriction is what
makes this source-available rather than open source, and the project says so
plainly rather than borrowing a word it is no longer entitled to.

Content is not all under one licence, and the thing that decides is not who
typed it — it is whose work it came from. Three kinds:

**Written here from nothing** — the passages, the slot library, the schemas.
CC0 and unrestricted. Attribution is encouraged and never required; the project
claims the infrastructure that serves the content, not the content itself.

**Built here from somebody else's work.** These carry that work's terms, not
ours, even though our scripts produced them — running a dataset through a script
of ours does not make the result ours. Two live cases:
`content/difficulty.json`, whose numbers come from Robyn Speer's `wordfreq` and
which travels with the credit that list requires; and the rewritten glosses,
which start from Wiktionary and so carry its credit and its
pass-on-the-same-freedom terms — `content/glosses/bram-stoker_dracula.json` is
the first one that ships.

**Not authored here at all** — the text inside cited excerpts, and the books in
the [library](https://github.com/superb-catalogue/library). Each keeps whatever
terms it arrived under: public domain and CC0 where possible, and licences
asking for credit or for the same freedom to be passed on where that is what the
good source carries.

Nothing non-commercial and nothing all-rights-reserved enters a build, ever.

Each obligation is written down next to the thing it binds, so it stays with
that file and never spreads into ours or into the code: **datasets** have a row
in `data/MANIFEST.md`, with the credits that must travel in `data/NOTICE.md`;
**each excerpt** carries its own provenance record beside it in
`content/sources/`; **each book** carries its own beside it in the library.

No GPL enters the dependency tree. Every dataset has a row in
`data/MANIFEST.md` with its source, licence, and redistribution basis, and CI
fails without one. SWOW-EN and the USF association norms are permanently
excluded: they are not licence-compatible with a product that has a paid tier,
and no amount of convenience changes that.
<!-- LICENCE-CLAIMS:END -->

## Thanks to Standard Ebooks

The library of whole books Superb reads from is built on
[Standard Ebooks](https://standardebooks.org) editions.

They take public-domain books, proofread them properly, and typeset them with
real care — and then they put the whole file in the public domain, their own
editing work included. That last part is unusual. Most people who improve a
free text keep something back for the improving; Standard Ebooks gives it away,
which is why their editions are the ones worth building on and why anyone else
can build on them too.

The books live in a separate repository,
[superb-catalogue/library](https://github.com/superb-catalogue/library), so that
nobody working on the engine has to download a library and nobody adding a book
has to download an engine. Each book there records the edition it came from and
the terms it arrived under.

If you use their editions, consider [supporting
them](https://standardebooks.org/donate).

## Built with AI tooling

Superb is developed with substantial help from AI coding agents, working under
a written decision record and reviewed against a fixed test suite before
anything merges. Individual commits are not annotated with which model touched
them — the record of what changed is the diff and the tests, the same as any
other project. Saying it plainly once here seemed more useful than a trailer
on every commit.

## Contributing

Open. See `CONTRIBUTING.md` for setup, tests, and conventions; bug reports
and feature requests use the issue forms. The well-bounded lanes are passage
and slot authoring, sourcing and citing public-domain excerpts, gloss
rewrites, example-sentence curation, and phonetics edge cases.

A contributed excerpt needs a complete, checkable citation and has to use its
target vocabulary in genuinely informative context — where meaning can be
inferred from the writing itself. That is the whole bar; it is also a higher
bar than it sounds.

Contributions are DCO sign-off (`git commit -s`), not a CLA.
