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
    /// The mean of `θ̂ - θ`, **signed** — and the reason it exists is worth
    /// stating, because its absence cost this project weeks.
    ///
    /// This instrument used to report only `mean_abs_error`, which cannot
    /// tell a noisy estimator from a biased one: an estimator scattering
    /// symmetrically around the truth and one being dragged steadily
    /// downward produce the same absolute error, and only the second is
    /// broken. Under-coverage was measured at 13.0%, then 0.0% at three
    /// times the horizon, and the committed report concluded from those
    /// numbers alone that the *standard error* was too narrow. It was not.
    /// θ̂ was systematically low — a bias of -0.13 to -0.73 depending on
    /// true θ, worsening to -2.34 at the longer horizon — because the
    /// pseudoword penalty accumulated without bound. One signed column
    /// would have pointed straight at it.
    ///
    /// A well-calibrated estimator's signed error sits near zero and does
    /// not drift with horizon. If this number is large next to
    /// `mean_abs_error`, the estimate is biased and no amount of widening
    /// the interval is the right fix.
    pub mean_signed_error: f64,
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
/// The same measurement, broken out per true θ — because the aggregate can
/// hide a structural effect that is obvious the moment the runs are grouped.
///
/// The residual this exists to keep visible: `THETA_SWEEP`'s extreme points
/// sit half a logit from the `theta_min` / `theta_max` clamp at ±4.0, and an
/// estimator that cannot step past a wall is biased *inward* near it —
/// positive signed error at the bottom of the sweep, negative at the top,
/// neither of which the standard error knows about. That shows up as worse
/// coverage at the extremes than in the middle, and it is a property of
/// where the sweep was placed relative to the clamp rather than a defect in
/// the estimator. Reported rather than tuned away: moving the clamp or
/// moving the sweep would both make this table look better without anyone
/// having decided whether a reader at θ = ±3.5 is a case worth optimising.
/// Computed from the runs the aggregate measurement already made — never by
/// re-running the sweep. Re-running would double the cost of this report for
/// a grouping that is pure arithmetic over results already in hand, and
/// would additionally let the two halves of the same report disagree.
pub fn measure_detailed(
    seeds: &[u64],
    theta_sweep: &[f64],
    config: &SimConfig,
) -> (Coverage, Vec<(f64, Coverage)>) {
    let assertion1 = Assertion1::run(seeds, theta_sweep, config);
    let overall = coverage_from_runs(&assertion1.runs);
    let per_theta = theta_sweep
        .iter()
        .map(|&theta| {
            let rows: Vec<_> = assertion1
                .runs
                .iter()
                .filter(|run| run.true_theta == theta)
                .copied()
                .collect();
            (theta, coverage_from_runs(&rows))
        })
        .collect();
    (overall, per_theta)
}

/// The one reduction from per-run records to a [`Coverage`], shared by the
/// aggregate and the per-θ breakdown so the two cannot compute the same
/// statistic two ways.
fn coverage_from_runs(runs: &[crate::report::ConvergenceRun]) -> Coverage {
    let n = runs.len();
    if n == 0 {
        return Coverage {
            runs: 0,
            within_1se: 0,
            within_2se: 0,
            mean_abs_error: 0.0,
            max_abs_error: 0.0,
            mean_signed_error: 0.0,
        };
    }
    Coverage {
        runs: n,
        within_1se: runs.iter().filter(|r| r.within_se).count(),
        within_2se: runs
            .iter()
            .filter(|r| r.abs_error <= 2.0 * r.final_se)
            .count(),
        mean_abs_error: runs.iter().map(|r| r.abs_error).sum::<f64>() / n as f64,
        max_abs_error: runs.iter().map(|r| r.abs_error).fold(0.0_f64, f64::max),
        mean_signed_error: runs
            .iter()
            .map(|r| r.final_theta - r.true_theta)
            .sum::<f64>()
            / n as f64,
    }
}

pub fn measure(seeds: &[u64], theta_sweep: &[f64], config: &SimConfig) -> Coverage {
    coverage_from_runs(&Assertion1::run(seeds, theta_sweep, config).runs)
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

    let (coverage, per_theta) = measure_detailed(&MANY_SEEDS, theta_sweep, &base_config);
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
         {:.4}, max {:.4}, and **mean signed error {:+.4}**.\n\n\
         **Read the signed error first.** It is the column that separates a noisy estimator \
         from a biased one, and its absence is why this instrument once misdiagnosed its own \
         finding: absolute error alone cannot tell scatter around the truth from a steady drag \
         away from it, and only the second is a broken estimator. A signed error small next to \
         the absolute error means the runs are scattered; one approaching the absolute error \
         in size means they are nearly all on the same side, and widening the standard error \
         would be treating a symptom.\n\n{}\n\n",
        coverage.within_1se_rate() * 100.0,
        coverage.within_1se,
        coverage.runs,
        coverage.within_2se_rate() * 100.0,
        coverage.within_2se,
        coverage.runs,
        coverage.mean_abs_error,
        coverage.max_abs_error,
        coverage.mean_signed_error,
        if coverage.mean_signed_error.abs() > 0.5 * coverage.mean_abs_error {
            "**On this run the estimator is biased, not merely noisy** — the signed error is a \
             large fraction of the absolute error, so the runs sit predominantly on one side of \
             the truth. Find what is moving θ̂ in that direction; do not widen the interval."
        } else {
            "On this run the signed error is small relative to the absolute error, so the runs \
             scatter around the truth rather than sitting on one side of it — the estimate is \
             not detectably biased at this sample size."
        },
    ));

    out.push_str("### Per true θ — where the residual lives\n\n");
    out.push_str(
        "The aggregate above can hide a structural effect that grouping makes obvious. \
         `theta_min` / `theta_max` clamp θ̂ at ±4.0, and the sweep's outermost points sit half a \
         logit inside that wall — an estimator that cannot step past a wall is biased *inward* \
         near it, which the standard error knows nothing about. Expect signed error to lean \
         positive at the bottom of the sweep and negative at the top, with coverage worst at \
         both ends and best in the middle. That is a fact about where the sweep was placed \
         relative to the clamp, not a defect in the estimator, and it is reported rather than \
         tuned away: moving either the clamp or the sweep would improve this table without \
         anyone having decided whether a reader at θ = ±3.5 is a case worth optimising.\n\n",
    );
    out.push_str("| true θ | within 1 SE | within 2 SE | mean signed error | mean abs error |\n");
    out.push_str("|---|---|---|---|---|\n");
    for (theta, c) in &per_theta {
        out.push_str(&format!(
            "| {:+.1} | {:.1}% ({}/{}) | {:.1}% ({}/{}) | {:+.4} | {:.4} |\n",
            theta,
            c.within_1se_rate() * 100.0,
            c.within_1se,
            c.runs,
            c.within_2se_rate() * 100.0,
            c.within_2se,
            c.runs,
            c.mean_signed_error,
            c.mean_abs_error,
        ));
    }
    out.push('\n');

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
            "**Coverage moved further from 68% with more horizon, not closer, and that shape is \
             diagnostic on its own.** A standard error that is merely too narrow by some factor \
             under-covers by roughly the same amount at every horizon. Coverage that *decays* as \
             evidence accumulates means something is moving θ̂ away from the truth faster than \
             the interval shrinks — a bias, not a width. Check the signed error above and find \
             what is dragging the estimate; widening the interval cannot fix this shape."
        } else {
            "Coverage did not move meaningfully with 3x the horizon — the evidence argues against \
             \"needs more observations\" as the explanation, and toward the response model's own \
             sampling noise or the standard error's own construction."
        },
    ));

    out.push('\n');
    out.push_str("## The diagnosis this instrument once got wrong\n\n");
    out.push_str(
        "**Kept in the generated report on purpose, because the mistake is more instructive \
         than the fix.** Earlier revisions of this file measured 13.0% within 1 SE at the base \
         horizon and 0.0% at 3x, and concluded from those two numbers that the *standard \
         error* — `1 / sqrt(theta_information)` — was under-reporting its true uncertainty. \
         That conclusion was wrong, and it was wrong in a way this report's own columns could \
         not have caught, because it reported only absolute error.\n\n\
         The standard error was correct. **θ̂ was biased downward**, by -0.13 to -0.73 logits \
         depending on true θ at the base horizon, and by as much as -2.34 at 3x. The cause was \
         `ability::update_theta`'s pseudoword branch: an over-claimed pseudoword stepped θ down \
         by a flat `pseudoword_penalty` that never shrank, while the real-word step beside it \
         was divided by accumulated Fisher information and did. Two update rules on diverging \
         scales — so past a few dozen observations the penalty was an order of magnitude larger \
         than any correction the real evidence could still apply, and it walked θ̂ to the clamp \
         while the interval around it went on tightening.\n\n\
         **The experiment that settled it**, and it was one run: hold everything constant and \
         set the simulator's `overclaim_rate` to zero. On a 12-seed × 5-θ probe (60 runs) that \
         took coverage from 20.0% to 66.7% with the standard error untouched — and the same \
         probe at 3x horizon went from 0.0% to 63.3%, which is the half that matters, because \
         no change to the *width* of an interval can stop a coverage rate from decaying with \
         horizon. That probe is quoted here at its own sample size on purpose; it is not this \
         report's headline figure, which is the 200-run number at the top of the file.\n\n\
         The correction is now keyed to the observed over-claim **rate**, bounded by \
         `pseudoword_penalty`, and applied where the estimate is read rather than inside the \
         recursion (`ability::overclaim_correction`, `LearnerState::theta`). A bounded \
         correction converges, so θ̂ converges, so `1 / sqrt(information)` describes it again.\n\n\
         **What is still open, and is not answered anywhere in this repository:** how large the \
         correction *should* be. `pseudoword_penalty` sets how far a total over-claimer is \
         marked down, and no measurement here fixes it — this simulator's over-claimer answers \
         real words honestly (`oracle::knows_real_item` reads only `true_theta` and \
         `difficulty`), so in simulation the correct correction is zero and any positive value \
         costs a little coverage. Calibrating the magnitude needs a synthetic learner whose \
         over-claiming also inflates real-word responses. Named as owed rather than guessed at.\n\n\
         **The tripwire ADVISORY-005 §1 item 1 wrote in still holds:** nothing consumes \
         `theta_se`. The composer band reads θ̂, not its error. What has changed is that a \
         consumer landing tomorrow would inherit an estimator measured to be calibrated rather \
         than measured to be over-confident.\n",
    );

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
            mean_signed_error: 0.0,
        };
        assert_eq!(coverage.within_1se_rate(), 0.0);
        assert_eq!(coverage.within_2se_rate(), 0.0);
    }
}
