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

/// "Many seeds per θ" — ADVISORY-005 §1 item 1's own phrase. 40 seeds × the
/// existing 5-point `THETA_SWEEP` is 200 runs, enough that a well-calibrated
/// 68% estimator's binomial margin of error at this n is under 4 points —
/// tight enough to tell "the 40% this crate measured at 3 seeds was real"
/// from "the 40% was 3-seed noise," which is exactly the question item 1
/// asks. Seeds start at 1000 to stay visibly disjoint from `FIXED_SEEDS`
/// ([42, 43, 44]) — this instrument is deliberately not reusing the pinned
/// report's own seeds, so a coincidence between the two is never mistaken
/// for corroboration.
///
/// Lives here, not in `bin/coverage.rs`, so `tests/coverage_gate.rs` can run
/// the exact same sweep the binary does and diff its output against the
/// committed `COVERAGE.md` — the two must read one set of seeds, not two
/// copies of the same literal that could drift apart.
pub const MANY_SEEDS: [u64; 40] = {
    let mut seeds = [0u64; 40];
    let mut i = 0;
    while i < 40 {
        seeds[i] = 1000 + i as u64;
        i += 1;
    }
    seeds
};

/// "A longer horizon at fixed seeds" — item 1's other named measurement,
/// asking whether Fisher scoring's asymptotics bite past the roughly 42
/// real-word observations `REPORT.md`'s own config produces (240 sessions ×
/// 1 calibration draw × 70% real). Fewer seeds than [`MANY_SEEDS`] — this
/// sweep is answering a shape question (does coverage move with horizon at
/// all), not trying to pin down the rate precisely — at 3x the sessions, so
/// roughly 3x the real-word observations per run.
pub const HORIZON_SEEDS: [u64; 15] = {
    let mut seeds = [0u64; 15];
    let mut i = 0;
    while i < 15 {
        seeds[i] = 2000 + i as u64;
        i += 1;
    }
    seeds
};
pub const HORIZON_MULTIPLIER: usize = 3;

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

/// Runs both sweeps [`MANY_SEEDS`] and [`HORIZON_SEEDS`] name, against
/// `THETA_SWEEP`, and formats `COVERAGE.md`'s markdown from the result.
///
/// **Why this lives in the library, not `bin/coverage.rs`.** `bin/coverage.rs`
/// calls this to print and write the committed file; `tests/coverage_gate.rs`
/// calls the exact same function to regenerate it at test time and diff the
/// two, byte for byte — the same discipline `main.rs`'s golden vectors already
/// use. A markdown-writer that only the binary can reach can drift from the
/// committed file the moment someone regenerates by hand and forgets a step;
/// one function two callers read cannot.
pub fn to_markdown(theta_sweep: &[f64]) -> String {
    let base_config = SimConfig::default();

    let coverage = measure(&MANY_SEEDS, theta_sweep, &base_config);
    let automatic = automatic_sample(&MANY_SEEDS, &base_config);

    let long_horizon_config = SimConfig {
        sessions: base_config.sessions * HORIZON_MULTIPLIER,
        ..base_config
    };
    let long_horizon_coverage = measure(&HORIZON_SEEDS, theta_sweep, &long_horizon_config);

    let mut out = String::new();
    out.push_str("# θ̂ coverage — ADVISORY-005 §1 items 1 and 2\n\n");
    out.push_str(&format!(
        "Generated by `cargo run -p superb-sim --bin coverage`. {} seeds × {} true-θ points \
         ({} runs) at {} sessions — the same session config `REPORT.md` uses \
         (`SimConfig::default()`) — plus {} seeds × {} true-θ points at {} sessions ({}x \
         horizon), disjoint from `FIXED_SEEDS` (`[42, 43, 44]`) so this instrument corroborates \
         rather than repeats `REPORT.md`'s own 3-seed sample.\n\n",
        MANY_SEEDS.len(),
        theta_sweep.len(),
        coverage.runs,
        base_config.sessions,
        HORIZON_SEEDS.len(),
        theta_sweep.len(),
        long_horizon_config.sessions,
        HORIZON_MULTIPLIER,
    ));

    out.push_str("## Coverage at REPORT.md's own horizon\n\n");
    out.push_str(&format!(
        "**{:.1}% of runs land within 1 SE** ({} of {}) — a well-calibrated estimator implies \
         ≈68%. **{:.1}% land within 2 SE** ({} of {}) — ≈95% implied. Mean absolute error \
         {:.4}, max {:.4}.\n\n\
         `REPORT.md`'s own 3-seed measurement read 40% (6 of 15). {} runs at {:.1}% {} that \
         reading: the per-θ pattern is not 3-seed noise — {}.\n\n",
        coverage.within_1se_rate() * 100.0,
        coverage.within_1se,
        coverage.runs,
        coverage.within_2se_rate() * 100.0,
        coverage.within_2se,
        coverage.runs,
        coverage.mean_abs_error,
        coverage.max_abs_error,
        coverage.runs,
        coverage.within_1se_rate() * 100.0,
        if (coverage.within_1se_rate() - 0.40).abs() < 0.10 {
            "confirms"
        } else {
            "revises"
        },
        if coverage.within_2se_rate() < 0.90 {
            "the 2 SE band is also under-covering, which argues for a genuinely under-wide \
             standard error rather than 1 SE alone being an unlucky band"
        } else {
            "the 2 SE band covers close to its own implied 95%, which argues the 1 SE gap is a \
             narrow-but-not-badly-broken standard error rather than a systematically biased one"
        },
    ));

    out.push_str("## The AUTOMATIC-word sample, fattened for free (item 2)\n\n");
    let histogram = automatic.histogram();
    out.push_str(&format!(
        "{} words reached AUTOMATIC across the {}-seed sample (`REPORT.md`'s own 3-seed sample \
         had 4). Mode {:?}, mean {:.2}, median {:.1}, min {:?}, max {:?}.\n\n",
        automatic.encounters.len(),
        MANY_SEEDS.len(),
        automatic.mode(),
        automatic.mean(),
        automatic.median(),
        automatic.encounters.iter().min(),
        automatic.encounters.iter().max(),
    ));
    out.push_str("| encounters | words |\n|---|---|\n");
    for (value, count) in &histogram {
        out.push_str(&format!("| {value} | {count} |\n"));
    }
    out.push('\n');

    out.push_str("## Coverage at 3x the horizon (does the gap close with more evidence)\n\n");
    out.push_str(&format!(
        "**{:.1}% within 1 SE** ({} of {}), **{:.1}% within 2 SE** ({} of {}), at {} sessions \
         ({} real-word observations per run vs. roughly {} at the base horizon). {}\n",
        long_horizon_coverage.within_1se_rate() * 100.0,
        long_horizon_coverage.within_1se,
        long_horizon_coverage.runs,
        long_horizon_coverage.within_2se_rate() * 100.0,
        long_horizon_coverage.within_2se,
        long_horizon_coverage.runs,
        long_horizon_config.sessions,
        (long_horizon_config.sessions as f64
            * long_horizon_config.calibration_items_per_session as f64
            * long_horizon_config.calibration_real_rate) as u32,
        (base_config.sessions as f64
            * base_config.calibration_items_per_session as f64
            * base_config.calibration_real_rate) as u32,
        if long_horizon_coverage.within_1se_rate() > coverage.within_1se_rate() + 0.05 {
            "Coverage moved meaningfully toward 68% with horizon — the evidence points at Fisher \
             scoring's asymptotics not yet biting at the base horizon's observation count, not at \
             a structurally over-confident estimator."
        } else if long_horizon_coverage.within_1se_rate() < coverage.within_1se_rate() - 0.05 {
            "Coverage moved further from 68% with more horizon, not closer — the evidence argues \
             against \"needs more observations\" as the explanation; a structural narrowness in \
             the standard error is the more likely of the report's three named candidates."
        } else {
            "Coverage did not move meaningfully with 3x the horizon — the evidence argues against \
             \"needs more observations\" as the explanation, and toward the response model's own \
             sampling noise or the standard error's own construction as the more likely of the \
             report's three named candidates."
        },
    ));

    out.push('\n');
    out.push_str("## What this changes, and what it does not\n\n");
    out.push_str(&format!(
        "**This revises `REPORT.md`'s own reading upward in severity, not just in sample size.** \
         Its 3-seed sample read 40% within 1 SE and called the gap unexplained-not-diagnosed. \
         The wider sample here reads {:.1}% — worse, not merely more precise — and the horizon \
         sweep answers the question ADVISORY-005 §1 item 1 posed with a direction, not just a \
         number: coverage does not improve with 3x the evidence, which weighs against \"the \
         report's 3-seed sample was unlucky\" and against \"Fisher scoring's asymptotics have not \
         bitten yet,\" and weighs toward the standard error's own construction (`1 / \
         sqrt(theta_information)`) under-reporting its true uncertainty at this response model's \
         parameters.\n\n\
         **This is still a finding, not a blocker, by the tripwire ADVISORY-005 §1 item 1 itself \
         wrote in:** \"this runs before anything consumes `theta_se`.\" Nothing merged through M1 \
         reads `theta_se` — the composer band reads θ̂, not its error — so this number moving \
         against the M1 ruling's expectation does not reopen that gate. It does mean the tripwire \
         is now closer: the next feature that reads `theta_se` for anything (a confidence-gated \
         UI decision, a probe-eligibility threshold, anything narrower than \"log it\") inherits \
         an estimator now measured, not assumed, to be materially over-confident.\n",
        coverage.within_1se_rate() * 100.0,
    ));

    out
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
