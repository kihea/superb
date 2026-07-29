//! Closes PR #37's own dropped DONE clause — "the assertion-1 gate and
//! `engine-contract` §5 agree, by derivation or diff" (`workspace/reviews/
//! PR-37.md`, finding 4) — mechanically, not by restating a number on one
//! side to match the other.
//!
//! **Why a restatement would just repeat the defect.** `docs/engine-contract.md`
//! §5 and this crate's coverage instrument are two separate files in two
//! separate repositories; nothing stops a future edit to either from drifting
//! from the other again, silently, the way §5's "40% (6 of 15)" already did
//! (that number was never revised when `COVERAGE.md`'s own wider run, 200
//! seeds at the same horizon, read 13.0%). Two things below make the drift a
//! test failure instead of a habit:
//!
//! 1. [`coverage_report_matches_a_fresh_run`] regenerates `COVERAGE.md` from
//!    the exact function the binary that writes it calls
//!    (`coverage::to_markdown`) and diffs it byte-for-byte against the
//!    committed file — the same discipline `superb-core`'s golden vectors
//!    already use. `docs/engine-contract.md` cites `COVERAGE.md` by figure
//!    and by file, not by a copied-out percentage; this test is what keeps
//!    the file itself honest, so the citation stays honest by construction.
//! 2. [`coverage_stays_within_the_bounds_the_contract_names_as_failures`]
//!    turns §5's own descriptive failure conditions — "a proportion
//!    materially below expectation means the estimator is over-confident...
//!    at or near 100% means the error is too wide to be worth reporting" —
//!    into an actual CI gate. This is deliberately a sanity band, not a
//!    target: it does not ask for ~68%, which `tests/assertions.rs`'s own doc
//!    comment already explains would create pressure to tune `tuning.toml`
//!    until a report reads green rather than honest. It only fires if
//!    coverage collapses toward 0% (a regression to BRIEF-014 round 1's
//!    over-confident `theta_se`) or balloons toward 100% (an SE inflated
//!    until nothing could fall outside it) — both named, both real defects
//!    this crate has already shipped once each.
//!
//! The two bounds are `coverage::WITHIN_1SE_RATE_FLOOR` and
//! `coverage::WITHIN_1SE_RATE_CEILING`, and `to_markdown` prints them into
//! `COVERAGE.md` from those same constants. So loosening a bound to make a
//! failing gate pass is not a one-line edit to a test file: it changes the
//! committed report, and test 1 fails until that change is regenerated and
//! committed in the open.
//!
//! **One sweep, not two.** The 200-run sweep behind this report is the most
//! expensive thing in the workspace — 2930s in CI when both tests ran it. Both
//! tests read one `coverage::generate()` behind a `OnceLock`, so it runs once
//! per test binary however many tests need it, while staying two separately
//! named failures.

use std::sync::OnceLock;

use superb_sim::coverage::{self, Report, WITHIN_1SE_RATE_CEILING, WITHIN_1SE_RATE_FLOOR};

fn report() -> &'static Report {
    static REPORT: OnceLock<Report> = OnceLock::new();
    REPORT.get_or_init(coverage::generate)
}

#[test]
fn coverage_report_matches_a_fresh_run() {
    let fresh = &report().markdown;
    let committed = include_str!("../COVERAGE.md");
    assert_eq!(
        fresh, committed,
        "COVERAGE.md is out of date with a fresh `cargo run -p superb-sim --bin coverage` — \
         regenerate it and commit the result in the same change. This file is generated output; \
         hand-written prose belongs beside it (see PSEUDOWORD_DIVERGENCE.md), not in it. This is \
         the mechanism that keeps `docs/engine-contract.md` §5's cited coverage figure and gate \
         bounds from drifting from the file it cites unnoticed, the way the figure already \
         drifted once (§5 said 40%/6-of-15 long after this file read 13.0%)."
    );
}

#[test]
fn coverage_stays_within_the_bounds_the_contract_names_as_failures() {
    let rate = report().coverage.within_1se_rate();

    // Not a target of ~68% — see this file's module doc for why gating on
    // the target itself would just move the tuning-pressure problem
    // `tests/assertions.rs` already avoids into a second file. These bounds
    // only catch the two failure shapes `docs/engine-contract.md` §5 already
    // names in words: collapsed-to-over-confident, or inflated-to-useless.
    assert!(
        rate > WITHIN_1SE_RATE_FLOOR,
        "{:.1}% of runs landed within 1 SE — at or near 0%, which §5 names as an \
         over-confident (too-narrow) standard error, the exact shape BRIEF-014 round 1 already \
         shipped once (0.006% after a fixed-decay `theta_se`). This is a regression, not a \
         tuning finding — report it, do not tune tuning.toml to move only this number.",
        rate * 100.0
    );
    assert!(
        rate < WITHIN_1SE_RATE_CEILING,
        "{:.1}% of runs landed within 1 SE — at or near 100%, which §5 names as a standard \
         error too wide to be worth reporting. This is a regression, not a tuning finding — \
         report it, do not tune tuning.toml to move only this number.",
        rate * 100.0
    );
}
