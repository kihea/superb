## Contributing to Superb

Welcome, and thank you for your interest in contributing to Superb.

**One thing before anything else: the person reading comes first, and you come
second.** That is not politeness. It decides pull requests. Superb is a
vocabulary app that never admits it is teaching, so a change that makes the
project nicer to work on but puts one number, one badge or one explanation in
front of a reader is rejected, and a change that makes your life harder while
leaving the reading surface silent is the one that gets merged.

In practice that means a few things you would not guess from the code:

- **The surface never explains itself.** No review queue, no streak, no level,
  no score, no congratulation, and no numbers facing the reader outside
  Settings. Target words are never marked. If a feature has to be explained to
  a reader, it is wrong by definition, however well it is built.
- **Convenience for us is not a reason.** "It was easier to expose the
  schedule" is not an argument; it is the failure this whole project is
  arranged to prevent.
- **Where the two genuinely conflict, say so in the pull request** rather than
  quietly picking one. Most of the time they do not conflict, and the times
  they do are worth a sentence.

Everything below, from the setup to the conventions to the tests, exists to
make that ordering cheap to hold rather than a thing you have to remember.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Overview](#overview)
3. [Vision](#vision)
4. [Setting up the development environment](#setting-up-the-development-environment)
5. [Testing](#testing)
6. [Conventions](#conventions)
7. [Proposing new features](#proposing-new-features)
   - [Sourced excerpts from existing literature](#sourced-excerpts-from-existing-literature)

---

## Code of Conduct

The project follows the Contributor Covenant v3 outlined in `CODE_OF_CONDUCT.md`. You can report
violations or harmful behavior to **kihea@icloud.com**.

---

## Overview

Superb is built on a simple rule: anything that costs nothing to supply costs
nothing to use. This public repository contains the engine, web app, site,
content, and build tooling needed to run the current product locally.

```
superb/
├─ crates/
│  ├─ superb-core/        pure engine: no I/O, clock, or RNG
│  ├─ superb-wasm/        WebAssembly boundary used by the web app
│  └─ superb-sim/         synthetic-reader and long-running checks
├─ apps/
│  ├─ web/                React 19 + Vite PWA
│  └─ site/               landing page and assembled deploy artifact
├─ data/                  build-time datasets, manifest, and pipeline
├─ content/               schemas, classes, passages, and cited sources
├─ design/                shared design tokens
└─ scripts/release.py     repository-level release candidate gate
```

The web shell may render, persist, and supply time. Scheduling and learner-state
decisions stay inside `superb-core` and cross the WebAssembly boundary as typed
plans and effects. The current web app stores learner state in IndexedDB.

---

## Vision

Superb exists to help people read with more range and confidence. It should feel
like reading, not like managing a course. The engine quietly schedules useful
encounters while the page stays free of scores, queues, levels, and teaching
language. Optional association, rhyme, and elevated-language challenges may
come later, but they do not set the shape of ordinary reading.

---

## Setting up the development environment

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Rust | 1.96.0 | Installed from `rust-toolchain.toml` via [rustup](https://rustup.rs/) |
| Node.js | 24 | Matches the web and site workflows |
| Python | 3.12 | Runs the data checks and root release command |
| wasm-bindgen-cli | 0.2.126 | Must match the checked-in Wasm crate |

Install the WebAssembly target and binding tool once:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.126 --locked
```

Then install and run the web app:

```sh
cd apps/web
npm ci
npm run dev
```

---

## Testing

Testing should be built into your contributions. A test lands in the same
commit as the behaviour it covers.

- `cargo test -p superb-core -p superb-wasm --all-features --locked` checks the
  engine and its WebAssembly boundary.
- `cargo test -p superb-sim --lib --test oracle_boundary --locked` runs the
  simulator checks kept in the pull-request lane.
- `python data/pipeline/tests/run_all.py` discovers and runs every executable
  Python regression test.
- `cd apps/web && npm test` runs type checking, lint, unit tests, the production
  build, and Playwright. Install Chromium first with
  `npx playwright install chromium`.
- `python scripts/release.py` runs the repository-level release candidate gate,
  including offline/installability checks and exact site-artifact restoration.

Long simulator sweeps and report regeneration run in the nightly deep-assurance
workflow. They are not part of the normal edit loop. Before opening a pull
request, run the focused commands for the files you changed; use the root
release command for a release candidate.

---

## Conventions

- Pull requests target `dev`, never `main`. Fill in the pull request template
  rather than deleting it. It asks what changed, what it looks like before and
  after, and what you ran to check.
- `cargo fmt --all --check` and
  `cargo clippy --all-targets --all-features --locked -- -D warnings` must
  pass.
- Dependencies are added with `--locked`, and every new crate must satisfy
  `deny.toml`.
<!-- LICENCE-CLAIMS:BULLET:START -->
- Code is MIT + Commons Clause. Content written here from nothing is CC0;
  anything built from or brought in from elsewhere keeps its own terms,
  including a gloss rewritten from a Wiktionary entry, which keeps Wiktionary's.
  Each obligation is recorded next to the thing it binds: a row in
  `data/MANIFEST.md` for a dataset, a provenance record beside each excerpt and
  each book. No GPL dependency can be accepted at any tier.
<!-- LICENCE-CLAIMS:BULLET:END -->
- Adding `Serialize`, `Deserialize`, `PartialOrd` or `Ord` to a type in any
  crate requires a matching entry in `wire-roster.toml` (workspace root), or
  the build fails.

---

## Licensing, and what you are agreeing to

<!-- LICENCE-CLAIMS:START -->
Superb's code is **source-available, not open source**: MIT with the
[Commons Clause](https://commonsclause.com/) on top. You may read it, run it,
change it, and pass it on, changed versions included, as long as it is free.
What you may not do is sell it, or sell a product or service whose value
comes substantially from it. The full text is in `LICENSE`, and the reasoning
is in the project's decision record.

The **content** is different. What decides is not who typed it but whose work
it came from. It splits three ways.

- **What you write from nothing**, such as a passage or a slot class, is CC0,
  dedicated to the public domain. Attribution is encouraged and never required.
- **What you build from somebody else's work** carries that work's terms, even
  though you did the building. A gloss from a Wiktionary entry is the case you
  are most likely to hit: it keeps Wiktionary's credit and its
  pass-on-the-same-freedom terms. The games' `content/challenges/glosses.json`
  and the composed-prose `content/glosses/prose.json` ship that way, and so
  does each book's own table, which lives beside that book in the library
  repository rather than here.
  `content/difficulty.json` is the same shape: our script builds it, and it
  travels with the credit its source list requires.
- **The text you bring**, like the words inside an excerpt you cite or a book
  added to the library, keeps whatever terms it arrived under. Your
  contribution is finding it, quoting it exactly, citing it so a stranger can
  check, and saying what those terms are.

Nothing non-commercial and nothing all-rights-reserved is accepted in any of
the three.
<!-- LICENCE-CLAIMS:END -->

**When you contribute code, you license it to the project under MIT**, and the
project distributes it under the licence above. This is deliberate and it is
in your interest as much as ours: permissive inbound is what keeps the project
able to change its own outbound licence later without hunting down every past
contributor for a signature.

Sign off your commits to say so:

```
git commit -s -m "your message"
```

That adds a `Signed-off-by:` line, which is your assertion of the
[Developer Certificate of Origin](https://developercertificate.org/): that
you wrote the change, or have the right to submit it. There is no CLA to sign
and no account to create.

**What you write for the project is CC0** under the provenance rules above, not
MIT, because content and code are separate throughout this project. What you *bring*,
like the text of a cited excerpt, keeps its own terms; your part is finding it,
citing it properly, and saying what those terms are.

---

## Proposing new features

You can propose a feature by opening an issue and picking the feature request
form. A composed passage belongs in `content/passages/` and must validate
against `content/schema/passage.schema.json`; its slot classes must already
exist in `content/classes/`. Run `python content/scripts/validate_schema.py`
and `python content/scripts/check_passages.py` before submitting it.

The former top-level `passages/` inbox predated the published schema and has
been removed. New passage work uses the checked content path above.

### Sourced excerpts from existing literature

A sourced excerpt is a different thing from an authored passage: it is
existing text, not new writing, and it carries the one hard rule this section
has. The source must be **Standard Ebooks**, **Project Gutenberg**, or
**Wikisource**, with Wikisource cited by revision permalink rather than a live
page that can change under the citation. Any other source is a change to this
file, never a contributor's judgment call.

A sourced excerpt exists to carry a word in a context that actually teaches
it. The surrounding sentence should let a reader who has never seen the
word work out what it means, not just show the word used correctly. Only
claim a word from the excerpt if the passage itself explains it; a word that
merely appears in the excerpt, with nothing around it doing any teaching,
does not belong in the claim list.

The citation must state:

- the work and its author
- **the year the work was first published**, not the year of the
  Gutenberg, Standard Ebooks or Wikisource edition you retrieved it from. *Heart
  of Darkness* is cited as `1899`, the year Conrad published it, never the
  year its Project Gutenberg edition happened to be posted.
- the edition or a stable URL
- the public-domain basis
- **the excerpt itself, quoted verbatim and as one continuous span from the
  source.** That quoted text is what makes the excerpt's boundaries
  checkable. There is no separate field for them, because a stranger
  verifies a citation by searching the source for the exact words you
  quoted. If you must leave part of a passage out, mark the gap rather than
  joining the remaining pieces silently; an unmarked cut is a misquotation,
  not a shorter citation.

An excerpt without a checkable citation does not enter a build, whatever its
quality.

---
