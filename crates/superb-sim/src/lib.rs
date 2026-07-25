//! The headless simulator (`docs/engine-contract.md` §5): synthetic
//! learners with known ground-truth vocabularies run `superb-core` through
//! sixty sessions, and the five assertions M1 closes on are checked against
//! the result.
//!
//! **What this crate is not.** It is not pure — `main.rs` prints and writes
//! a report — but it is deterministic: the same seed produces the same
//! output, byte for byte (every module's own tests pin this). See
//! `workspace/briefs/BRIEF-014-simulator.md` for the brief this crate
//! answers, and this crate's own module docs for how each of its two halves
//! — the oracle (`oracle.rs`) and the host (`simulation.rs`, `composer.rs`)
//! — is kept from reading the other's information.

pub mod composer;
pub mod oracle;
pub mod pseudoword_comparison;
pub mod report;
pub mod rng;
pub mod simulation;
pub mod tuning_extract;
pub mod vocabulary;

/// The seeds and the true-θ sweep this crate's own report is generated
/// from, and the ones `tests/assertions.rs` runs the five assertions
/// against — one place, so the committed report
/// (`crates/superb-sim/REPORT.md`) and the tests that must fail loudly if
/// the underlying property breaks are reading the exact same fixed inputs.
pub const FIXED_SEEDS: [u64; 3] = [42, 43, 44];
pub const THETA_SWEEP: [f64; 5] = [-3.5, -1.5, 0.0, 1.5, 3.5];
