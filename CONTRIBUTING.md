## Contributing to Superb

Welcome, and thank you for your interest in contributing to Superb! 

---

## Table of Contents

1. (Code of Conduct)[#code-of-conduct]
2. (Overview)[#overview]
3. (Vision)[#vision]
4. (Setting up the development environment)[#setting-up-the-development-environment]
5. (Testing)[#testing]
6. (Conventions)[#conventions]
7. (Proposing features)[#proposing-features]

---

## Code of Conduct

The project follows the Contributer Covenant v3 outlined in `CODE_OF_CONDUCT.md`. You can report violations or harmful behavior to **kihea@icloud.com**.

---

## Overview

This project is governed by the principles of education for all. Meaning, anything that doesn't cost to supply doesn't cost to the user. THe architecure is outlined below:
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
The app has 3 modes planned: learning mode, word association mode, and rhyming mode. Each targeting the bases of linguistic utlization. A daily user of this app should be eloquent and able to deploy the english language with advanced fluency.

---

# Setting up the development environment

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Rust | 1.88+ | Install via [rustup](https://rustup.rs/) |

Build using
```sh
cargo test -p superb-core     # the engine and its property tests
```

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

---

## Testing

Testing should be built into your contributions. `See app/**/tests`

---

## Conventions

To be populated.

---

## Proposing Features

You can propose new features by starting a new issue and using the feature flag.

---
