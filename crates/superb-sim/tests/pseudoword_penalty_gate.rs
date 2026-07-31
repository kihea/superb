//! BRIEF-017's own done clause: "the sweep runs as a committed binary or
//! test in `crates/superb-sim`, seeded, and reruns to identical numbers,"
//! and "`PSEUDOWORD-PENALTY.md` is committed." This is the mechanism that
//! keeps the two honest together — the same discipline
//! `tests/coverage_gate.rs` already uses for `COVERAGE.md`: regenerate the
//! report from the exact function `bin/pseudoword_penalty_calibration.rs`
//! calls, and diff it byte-for-byte against the committed file. A future
//! change to the sweep, the bluff model, or the candidate grid is a diff
//! against this file, not a silent drift between what is committed and what
//! the code now produces.

use std::sync::OnceLock;

use superb_sim::pseudoword_penalty_calibration::{self, Calibration};

fn calibration() -> &'static Calibration {
    static CALIBRATION: OnceLock<Calibration> = OnceLock::new();
    CALIBRATION.get_or_init(pseudoword_penalty_calibration::generate)
}

#[test]
fn pseudoword_penalty_report_matches_a_fresh_run() {
    let fresh = pseudoword_penalty_calibration::to_markdown(calibration());
    let committed = include_str!("../PSEUDOWORD-PENALTY.md");
    assert_eq!(
        fresh, committed,
        "PSEUDOWORD-PENALTY.md is out of date with a fresh `cargo run -p superb-sim --bin \
         pseudoword_penalty_calibration` — regenerate it and commit the result in the same \
         change."
    );
}

#[test]
fn the_sweep_reruns_to_identical_numbers_from_its_own_seed() {
    let first = pseudoword_penalty_calibration::to_markdown(calibration());
    let second =
        pseudoword_penalty_calibration::to_markdown(&pseudoword_penalty_calibration::generate());
    assert_eq!(
        first, second,
        "the same seeds produced two different reports across two runs"
    );
}

/// The bluffing-only reading of the pre-registered band (the honest one —
/// see `PSEUDOWORD-PENALTY.md`'s own account of why `b = 0.0` is degenerate
/// for this check) should not silently flip from run to run: this is a
/// sanity floor, not a target, so a future change to the estimator or the
/// bluff model that moves the spread outside a wide corridor is worth a
/// human reading `PSEUDOWORD-PENALTY.md` again, not a test that just keeps
/// passing.
#[test]
fn the_bluffing_only_spread_stays_in_a_sane_corridor() {
    let c = calibration();
    assert!(
        c.max_fraction_bluffing_only.is_finite() && c.max_fraction_bluffing_only < 1.0,
        "bluffing-only spread {:.1}% of its mean is implausibly large — read \
         PSEUDOWORD-PENALTY.md before trusting this number",
        c.max_fraction_bluffing_only * 100.0
    );
}
