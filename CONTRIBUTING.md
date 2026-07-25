# Contributing to Superb

## What Superb is

Superb is a vocabulary app that never admits it's teaching. You open it
and read. Words you don't know acquire meaning through context and
quiet resurfacing, until reading them produces automatic understanding.
Adaptive assessment, spaced repetition, and retrieval practice run
underneath, and none of it appears on screen.

The engine that drives this — the schedule, the word model, the
passage composer — is a pure Rust library with no clock and no
randomness of its own; the app that hosts it supplies both. Thin
shells for web, Android, and iOS render the engine's decisions. A
shell may display, gesture, save, and time. It does not decide.

## Licensing

Code is MIT. Content — passages, excerpts, glosses, example sentences
— is CC0. Attribution for content is encouraged and never required.
See `LICENSE` for the code text.

## What is open now

Issues and bug reports are open. So are code contributions to the Rust
engine (`crates/superb-core` and `crates/superb-sim`).

A code contribution faces the checks that already run in CI, on every
pull request:

- `cargo fmt --all --check`
- `cargo clippy --all-targets --all-features --locked -- -D warnings`
- the test suite, run with `cargo test --workspace --all-features
  --locked`
- a licence check over the whole dependency graph, run with `cargo
  deny --locked check licenses bans sources`
- the serialization roster: if your change adds `Serialize`,
  `Deserialize`, `PartialOrd`, or `Ord` to a type under
  `crates/superb-core/src`, that type must be added to
  `crates/superb-core/wire-roster.toml` or the build fails

If a change touches behaviour, open an issue first and describe what
you want to do. Typos, documentation fixes, and other obvious
one-liners can go straight to a pull request.

## What is not open yet

Passage and excerpt contributions are **not open**. A passage, an
excerpt, or a citation submitted today cannot be accepted, because the
schemas that would validate them do not exist yet. If you open a pull
request containing a passage or an excerpt, it will be closed, not
reviewed — that is not a judgment on the work, it is a statement that
there is nowhere yet for it to land.

This file will gain a second section covering passage and slot
authoring, sourcing and citing public-domain excerpts, gloss
rewrites, example-sentence curation, and phonetics edge cases, once
those schemas are published. The rest of this document describes the
rules that section will enforce, ahead of time, so that anyone
planning to contribute a passage later can read the bar in advance.
None of what follows is a standing invitation today.

## The two gates an excerpt will face

Every excerpt will pass through two separate gates, and the two will
not behave the same way.

**Provenance** is strict, mechanical, and unappealable. A citation
either resolves to a verifiable public-domain source or it does not.
It will be checked by CI, not by a person, and there is no argument
that fixes a citation that does not check out.

**Quality** is lenient, revocable, and biased toward admitting. A weak
excerpt is allowed to enter, because a weak excerpt is cheap: it can
be deleted in a single commit the moment it turns out not to work. A
badly-sourced excerpt is not cheap in the same way — once it has
shipped to devices, it cannot be reliably recalled from all of them.
The two gates have opposite postures because the two kinds of mistake
have different costs to undo.

## Source allow-list

In rank order, once excerpts open:

1. **Standard Ebooks** — text is already cleaned, proofread, and
   typeset from a public-domain source.
2. **Project Gutenberg** — the largest catalogue, with a clear
   public-domain basis stated per text.
3. **Wikisource** — cite by **revision permalink**, never a live page;
   a live page can change under the citation without warning.

Any other source is a change to this file, never a contributor's
judgment call. If a text you want isn't on one of these three, open an
issue proposing the source before you cite it anywhere.

## The complete citation shape

A citation is complete when a stranger can check it without asking you
anything. It has all of:

- the work's title
- the author's name
- the year of the cited edition (not first publication, if they
  differ)
- an edition identifier or a stable URL
- the public-domain basis (for example: published before 1929, or the
  author died more than 70 years ago, per the source's own statement)
- the exact excerpt boundaries (chapter, paragraph, or line range)

An excerpt without a verifiable citation does not enter a build,
whatever its quality.

## Removal policy

Any maintainer, any reviewer, and any contributor can remove any
excerpt at any time, by stating a one-line reason in the commit. There
is no appeal and no threshold to clear first. Removal is deliberately
cheaper than admission: it is far easier to take one excerpt out later
than to guarantee, before the fact, that every excerpt admitted was
worth admitting.

## Who reviews what

Provenance is checked by CI, not by a person: a citation either
resolves or it does not. Excerpt quality review may be performed by
automated reviewers as well as by people. This is disclosure, not
marketing — know what will read your submission before you write it.

## Code of conduct

Participation in this project is governed by the
[Code of Conduct](CODE_OF_CONDUCT.md). To report a possible violation,
contact the repo owner at kihea@icloud.com or open an issue.
