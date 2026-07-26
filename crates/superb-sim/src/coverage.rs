//! θ̂'s coverage, at the scale `docs/engine-contract.md` §5's amendment and
//! ADVISORY-005 §1 items 1–2 actually call for.
//!
//! **What §5's amendment settled, and what it left owed.** BRIEF-014 round
//! 3's report graded θ̂ pass/fail on "converges within its own reported
//! standard error" — a category error the amendment named and corrected: a
//! standard error is a claim about the *spread of an estimator across
//! repeated draws at the same true θ*, not a bound on where any one run
//! lands. The right question is a **coverage** question — over many seeds
//! and many true θ, does the proportion of runs landing within 1 SE sit near
//! 68%, and within 2 SE near 95%? The first measurement under that
//! definition, in `REPORT.md`, is 3 seeds per θ: honestly reported, and
//! explicitly too small a sample to separate "the estimator is
//! over-confident" from "3 seeds is noise." ADVISORY-005 §1 item 1 names the
//! discharge: many seeds per θ, and a longer horizon at fixed seeds — this
//! module is that run, kept apart from `report.rs`'s five M1 assertions
//! because those must stay pinned to `FIXED_SEEDS` and `THETA_SWEEP`
//! (`lib.rs`'s own doc comment: the same fixed inputs the committed
//! `REPORT.md` and `tests/assertions.rs` both read) — broadening them here
//! instead would silently change what `REPORT.md` measures.
//!
//! **Item 2 falls out of the same run for free.** ADVISORY-005's own words:
//! "the same extended-horizon run that discharges item 1 fattens \[the
//! AUTOMATIC-word\] sample for free." `Assertion2`-style encounter counts
//! are gathered from the same seeds this module already runs, at θ = 0.0,
//! rather than a second sweep.
//!
//! **What this module is not.** It does not change `report.rs`'s five
//! assertions, `FIXED_SEEDS`, or `THETA_SWEEP` — those stay exactly what
//! they were, a golden-vector-style pinned artifact. This is a second,
//! independent instrument answering a question `REPORT.md`'s own 3-seed
//! sample said it could not answer.

use crate::report::{Assertion1, Assertion2};
use crate::simulation::SimConfig;

/// A coverage measurement: how many runs, how many landed within 1 SE and
/// within 2 SE of the true θ, against what a well-calibrated estimator
/// implies (≈68% and ≈95%).
#[derive(Debug, Clone, Copy)]
pub struct Coverage {
    pub runs: usize,
    pub within_1se: usize,
    pub within_2se: usize,
    pub mean_abs_error: f64,
    pub max_abs_error: f64,
}

impl Coverage {
    pub fn within_1se_rate(&self) -> f64 {
        rate(self.within_1se, self.runs)
    }

    pub fn within_2se_rate(&self) -> f64 {
        rate(self.within_2se, self.runs)
    }
}

fn rate(count: usize, total: usize) -> f64 {
    if total == 0 {
        0.0
    } else {
        count as f64 / total as f64
    }
}

/// Run [`Assertion1`] (this crate's existing per-run convergence machinery —
/// unchanged, just given more seeds) across `seeds` × `theta_sweep` at
/// `config`'s horizon, and reduce it to a [`Coverage`].
///
/// Reused rather than re-implemented: the per-run θ̂/SE/error computation is
/// exactly `Assertion1::run`'s, and duplicating it here is exactly the
/// two-artifacts-that-must-agree shape ADVISORY-005 §3 names as the standing
/// defect to stop re-deriving. `within_2se` is the one thing `Assertion1`
/// itself does not compute, because `report.rs`'s 3-seed sample never needed
/// a second band — added here rather than there, since `report.rs`'s own
/// output is a pinned artifact this module does not touch.
pub fn measure(seeds: &[u64], theta_sweep: &[f64], config: &SimConfig) -> Coverage {
    let assertion1 = Assertion1::run(seeds, theta_sweep, config);
    let within_2se = assertion1
        .runs
        .iter()
        .filter(|run| run.abs_error <= 2.0 * run.final_se)
        .count();
    Coverage {
        runs: assertion1.runs.len(),
        within_1se: assertion1.converged_count(),
        within_2se,
        mean_abs_error: assertion1.mean_abs_error(),
        max_abs_error: assertion1.max_abs_error(),
    }
}

/// [`Assertion2`]'s own histogram, reduced to what item 2's discharge asks
/// for: how many words reached `AUTOMATIC` at all, and where the mode,
/// mean, and extremes fall — same reduction `report.rs` already does, on
/// the wider `seeds` this module runs.
pub fn automatic_sample(seeds: &[u64], config: &SimConfig) -> Assertion2 {
    Assertion2::run(seeds, 0.0, config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn measure_counts_every_seed_theta_pair() {
        let config = SimConfig {
            sessions: 20,
            ..SimConfig::default()
        };
        let coverage = measure(&[1, 2, 3], &[-1.0, 1.0], &config);
        assert_eq!(coverage.runs, 6);
        assert!(coverage.within_1se <= coverage.runs);
        assert!(coverage.within_2se <= coverage.runs);
        // 2 SE is a wider band than 1 SE around the same point estimate, so
        // it can never catch fewer runs.
        assert!(coverage.within_2se >= coverage.within_1se);
    }

    #[test]
    fn rate_of_zero_runs_is_zero_not_nan() {
        let coverage = Coverage {
            runs: 0,
            within_1se: 0,
            within_2se: 0,
            mean_abs_error: 0.0,
            max_abs_error: 0.0,
        };
        assert_eq!(coverage.within_1se_rate(), 0.0);
        assert_eq!(coverage.within_2se_rate(), 0.0);
    }
}
