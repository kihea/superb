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

Early. The engine is being built before any interface exists, which is
deliberate — the scheduling behaviour is the product, and it is provable
without a screen.

## Shape

One pure Rust engine, three thin shells, no server.

- `crates/superb-core` — the engine. Word state machine, scheduler, ability
  estimator, passage composer. Pure: no clock, no RNG, no I/O. `now` and seeds
  are parameters. This is the primary artifact.
- `crates/superb-sim` — headless simulator. Synthetic learners with known
  vocabularies, run over many sessions to prove the schedule converges.
- `apps/web` — React + Vite PWA. First platform.
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

More arrives as the milestones do.

## Licensing

**Code is MIT. Content is CC0.** Attribution is encouraged and never required
— the project claims the infrastructure that serves the content, not the
content itself.

No GPL enters the dependency tree. Every dataset has a row in
`data/MANIFEST.md` with its source, licence, and redistribution basis, and CI
fails without one. SWOW-EN and the USF association norms are permanently
excluded: they are not licence-compatible with a product that has a paid tier,
and no amount of convenience changes that.

## Built with AI tooling

Superb is developed with substantial help from AI coding agents, working under
a written decision record and reviewed against a fixed test suite before
anything merges. Individual commits are not annotated with which model touched
them — the record of what changed is the diff and the tests, the same as any
other project. Saying it plainly once here seemed more useful than a trailer
on every commit.

## Contributing

Not yet open; `CONTRIBUTING.md` lands before it is. When it does, the
well-bounded lanes are passage and slot authoring, sourcing and citing
public-domain excerpts, gloss rewrites, example-sentence curation, and
phonetics edge cases.

A contributed excerpt needs a complete, checkable citation and has to use its
target vocabulary in genuinely informative context — where meaning can be
inferred from the writing itself. That is the whole bar; it is also a higher
bar than it sounds.

Contributions will be DCO sign-off, not a CLA.
