## Contributing to Superb

Welcome, and thank you for your interest in contributing to Superb! 

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

This project is governed by the principles of education for all. Meaning, anything that doesn't
cost to supply doesn't cost to the user. The architecture is outlined below:
```
superb/                      PRIVATE · the working root
├─ CLAUDE.md                     project constitution — read first
│
└─ app/  ─────────────────────▶  PUBLIC · MIT · github.com/kihea/superb
   │                             a git submodule. everything a person needs to
   │                             build and run Superb, and nothing else.
   │
   ├─ README.md · LICENSE · CONTRIBUTING.md
   │
   ├─ crates/
   │  ├─ superb-core/            THE ENGINE. pure. no I/O, no clock, no RNG.
   │  │  ├─ src/{state,scheduler,ability,signals,composer,tuning}.rs
   │  │  ├─ tuning.toml          every tunable constant, in one file
   │  │  └─ tests/{property,golden}/
   │  ├─ superb-sim/             headless simulator: synthetic learners
   │  ├─ superb-wasm/            wasm-bindgen surface for web
   │  └─ superb-ffi/             UniFFI surface for Kotlin and Swift
   │
   ├─ data/
   │  ├─ MANIFEST.md             every dataset row. CI gate. ADR-008.
   │  ├─ pipeline/               python build scripts (build-time only)
   │  └─ out/                    generated artifacts (gitignored)
   │
   ├─ content/
   │  ├─ schema/                 passage · slot-class · provenance schemas
   │  ├─ classes/                semantic / POS slot classes
   │  ├─ passages/               composed: the authored slot library
   │  └─ sources/                sourced: cited public-domain excerpts
   │
   ├─ apps/
   │  ├─ web/                    React 19 + Vite + PWA
   │  ├─ android/                Kotlin + Jetpack Compose
   │  └─ ios/                    SwiftUI  (M8)
   │
   ├─ design/
   │  └─ tokens.json             single source of truth, design tool ↔ code
   │
   └─ .github/workflows/         core · sim · data-license · web · android


```
```
                      ┌──────────────────────────┐
   data/pipeline ────▶ │  reference artifacts     │
   (python, build-time)│  frequency · glosses ·   │
                      │  sentences · pseudowords │
                      └───────────┬──────────────┘
                                  │ read-only, host-owned
                                  ▼
  ┌────────────┐    plan()   ┌─────────────────────┐
  │            │────────────▶│                     │
  │   shell    │             │   superb-core       │  pure · sync · no I/O
  │  (web /    │◀────────────│   state machine     │  no clock · no RNG
  │  android / │   decide()  │   scheduler         │
  │   ios)     │────────────▶│   θ / IRT estimator │
  │            │◀────────────│   signal ranking    │
  └─────┬──────┘   effects   │   composer          │
        │                    └─────────────────────┘
        ▼
  learner state (IndexedDB / Room / GRDB)  ── never leaves the device
```
---

## Vision

It is woefully apparent that there is an ongoing literacy crisis among the working class. The gap between understanding english and to using it masterfully is widening fast especially among the generation eclipsed by the attention economy. This app hopes to lessen this gap in an engaging way.
The app has 3 modes planned: learning mode, word association mode, and rhyming mode. Each targeting
the bases of linguistic utilization. A daily user of this app should be eloquent and able to deploy
the english language with advanced fluency.

---

## Setting up the development environment

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Rust | 1.96.0 | Install via [rustup](https://rustup.rs/) |

Build using
```sh
cargo test -p superb-core     # the engine and its property tests
```

One pure Rust engine, three thin shells, no server. Today, only
`crates/superb-core` exists in this repository — the rest of the list below is
the planned shape, not a directory you can clone and open yet.

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

---

## Testing

Testing should be built into your contributions. A test lands in the same
commit as the behaviour it covers.

- `cargo test -p superb-core` — the engine and its property tests.
- `cargo test --workspace --all-features --locked` — the full suite, exactly
  as CI runs it; run this before opening a pull request.

Tests live in `crates/superb-core/tests/`. Behaviour there is pinned by
property tests over a generated domain, not by a handful of hand-picked
examples — see `crates/superb-core/tests/state_properties.rs` for what that
looks like in practice.

---

## Conventions

- Pull requests target `dev`, never `main`.
- `cargo fmt --all --check` and
  `cargo clippy --all-targets --all-features --locked -- -D warnings` must
  pass.
- Dependencies are added with `--locked`, and every new crate must satisfy
  `deny.toml`.
- Code is MIT and content is CC0, and no GPL dependency can be accepted at
  any tier.
- Adding `Serialize`, `Deserialize`, `PartialOrd` or `Ord` to a type in
  `superb-core` requires a matching entry in `wire-roster.toml`, or the build
  fails.

---

## Proposing new features

You can propose a feature using issues, tagged with the feature label. You can also submit passages
in `/passages`. Passages that use vocabulary masterfully (intentionally broad term) and in context
are approved and added to the engine sourcing. The submission of passages is intended to highlight
intentional, high level, or sophisticated human-written literature.

A submitted passage lands in `passages/` as prose — the schema is not
published yet, so it is not validated against a format. It may be judged by
people or by automated reviewers, and it can be removed later by anyone —
maintainer, reviewer, or contributor — with a one-line reason in the commit.
Removal is deliberately cheap: a weak passage costs one commit to take back
out, so the bar for accepting one can stay generous without the project being
stuck with it.

### Sourced excerpts from existing literature

A sourced excerpt is a different thing from an authored passage: it is
existing text, not new writing, and it carries the one hard rule this section
has. The source must be **Standard Ebooks**, **Project Gutenberg**, or
**Wikisource** — Wikisource cited by revision permalink, not a live page that
can change under the citation. Any other source is a change to this file,
never a contributor's judgment call.

The citation must state:

- the work and its author
- the year of the cited edition
- the edition or a stable URL
- the public-domain basis
- the exact excerpt boundaries

An excerpt without a checkable citation does not enter a build, whatever its
quality.

---
