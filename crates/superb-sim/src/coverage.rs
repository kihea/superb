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

use crate::THETA_SWEEP;
use crate::report::{Assertion1, Assertion2, ConvergenceRun};
use crate::simulation::SimConfig;

/// The floor and ceiling `tests/coverage_gate.rs` fails outside of, and the
/// two failure shapes `docs/engine-contract.md` §5 describes in words: a
/// standard error so narrow that almost nothing lands inside it, or so wide
/// that almost nothing lands outside. Deliberately not a target of ≈68% —
/// `tests/assertions.rs`'s own doc comment explains why gating on the target
/// would create pressure to tune `tuning.toml` until a report reads green
/// rather than honest.
///
/// They live here, next to the measurement, because [`to_markdown`] prints
/// them into `COVERAGE.md` from these same constants. §5 already cites that
/// file; printing the band into it is what lets §5 cite the gate itself by
/// file rather than paraphrase it, and it makes a change to either bound a
/// byte difference in a committed file instead of a silent edit to a test.
pub const WITHIN_1SE_RATE_FLOOR: f64 = 0.01;
pub const WITHIN_1SE_RATE_CEILING: f64 = 0.90;

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
    ///
    /// Read it per true θ, not only in aggregate: shrinkage toward a prior
    /// is antisymmetric across a symmetric sweep, so it very nearly cancels
    /// in the mean. [`generate`] reports the worst single θ for that reason.
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
pub fn measure(seeds: &[u64], theta_sweep: &[f64], config: &SimConfig) -> Coverage {
    measure_detailed(seeds, theta_sweep, config).0
}

/// The same measurement, and the same runs, grouped by true θ as well as
/// aggregated — because the aggregate hides any effect that changes sign
/// across the sweep, and shrinkage toward a prior is exactly that shape.
///
/// The grouping is free. Each thread already runs one θ, so the per-θ rows
/// are the threads' own results and the aggregate is those rows concatenated
/// in sweep order; nothing is measured twice, and the two halves of the
/// report cannot disagree about a number they compute once.
///
/// **One thread per true θ, and why the result is identical to one thread for
/// all of them.** `simulation::run` is a function of `(seed, true_theta,
/// config)` and nothing else; `Assertion1::run` walks θ on the outside and
/// seeds on the inside; the per-θ results are joined back in `theta_sweep`'s
/// own order. So the concatenated `runs` sequence is the one a sequential call
/// builds, in the same order, which matters because `mean_abs_error` sums it —
/// same order, same float, same bytes in `COVERAGE.md`.
///
/// The threads are here and not in `report.rs` because `REPORT.md`'s five
/// assertions are a pinned artifact this module does not touch. They are here
/// at all because this sweep is the most expensive thing in the workspace and
/// both gate tests share one run of it: when the second test stopped running
/// its own copy, the two stopped overlapping on CI's cores and the gate's wall
/// time went *up*, from 2930s to 4034s. Splitting the sweep itself gets the
/// overlap back without paying for a second sweep.
pub fn measure_detailed(
    seeds: &[u64],
    theta_sweep: &[f64],
    config: &SimConfig,
) -> (Coverage, Vec<(f64, Coverage)>) {
    let per_theta_runs: Vec<(f64, Vec<ConvergenceRun>)> = std::thread::scope(|scope| {
        let threads: Vec<_> = theta_sweep
            .iter()
            .map(|&true_theta| {
                (
                    true_theta,
                    scope.spawn(move || Assertion1::run(seeds, &[true_theta], config)),
                )
            })
            .collect();
        threads
            .into_iter()
            .map(|(true_theta, thread)| {
                (
                    true_theta,
                    thread
                        .join()
                        .unwrap_or_else(|_| panic!("a coverage sweep thread panicked"))
                        .runs,
                )
            })
            .collect()
    });

    let all_runs: Vec<ConvergenceRun> = per_theta_runs
        .iter()
        .flat_map(|(_, runs)| runs.iter().copied())
        .collect();
    let per_theta = per_theta_runs
        .iter()
        .map(|(true_theta, runs)| (*true_theta, coverage_from_runs(runs)))
        .collect();
    (coverage_from_runs(&all_runs), per_theta)
}

/// The one reduction from per-run records to a [`Coverage`], shared by the
/// aggregate and the per-θ breakdown so the two cannot compute the same
/// statistic two ways.
fn coverage_from_runs(runs: &[ConvergenceRun]) -> Coverage {
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
        within_1se: runs.iter().filter(|run| run.within_se).count(),
        within_2se: runs
            .iter()
            .filter(|run| run.abs_error <= 2.0 * run.final_se)
            .count(),
        mean_abs_error: runs.iter().map(|run| run.abs_error).sum::<f64>() / n as f64,
        max_abs_error: runs.iter().map(|run| run.abs_error).fold(0.0_f64, f64::max),
        mean_signed_error: runs
            .iter()
            .map(|run| run.final_theta - run.true_theta)
            .sum::<f64>()
            / n as f64,
    }
}

/// [`Assertion2`]'s own histogram, reduced to what item 2's discharge asks
/// for: how many words reached `AUTOMATIC` at all, and where the mode,
/// mean, and extremes fall — same reduction `report.rs` already does, on
/// the wider `seeds` this module runs.
pub fn automatic_sample(seeds: &[u64], config: &SimConfig) -> Assertion2 {
    Assertion2::run(seeds, 0.0, config)
}

/// `COVERAGE.md`'s markdown, together with the base-horizon [`Coverage`] the
/// markdown was formatted from.
///
/// The pair is returned rather than the markdown alone so a caller that needs
/// both — `tests/coverage_gate.rs` diffs the file *and* checks the rate against
/// [`WITHIN_1SE_RATE_FLOOR`] and [`WITHIN_1SE_RATE_CEILING`] — pays for the
/// 200-run sweep once instead of twice.
pub struct Report {
    pub markdown: String,
    pub coverage: Coverage,
}

/// The section of `COVERAGE.md` that prints the gate's own bounds, and the
/// paragraph saying what the gate does not check. Separated from [`generate`]
/// only so a unit test can check the coupling — that the two constants really
/// do reach the committed file — without paying for the 200-run sweep.
///
/// The second paragraph is emitted rather than written into the file by hand
/// for the same reason as the first: a caveat that only exists in a commit
/// message or a review is gone by the next regeneration.
fn gate_band_section() -> String {
    format!(
        "## The band this figure is gated against\n\n\
         `tests/coverage_gate.rs` fails if the within-1-SE rate drops to {:.1}% or below, or \
         reaches {:.1}% or above. Both bounds are printed here from the same constants the test \
         asserts on (`coverage::WITHIN_1SE_RATE_FLOOR` and `coverage::WITHIN_1SE_RATE_CEILING`), \
         so changing either is a byte difference in this committed file rather than a silent edit \
         to a test, and `docs/engine-contract.md` §5 can cite the gate by file instead of \
         describing it in words. It is a band, not a target of ≈68%: gating on the target would \
         create pressure to tune `tuning.toml` until this file reads green rather than \
         honest.\n\n\
         **What the check does not buy.** `coverage_report_matches_a_fresh_run` proves this file \
         is what the current code produces — that it is fresh, and that the run reproduces. It \
         says nothing about whether what the file concludes is true. The sentences above choose \
         themselves from the measurements (whether the wider sample \"confirms\" or \"revises\" \
         the 3-seed reading, which way the horizon paragraph goes), so a change to the estimator \
         regenerates this file into a different, equally confident, equally green report — and a \
         wrong one would read exactly as settled as a right one. Whether the conclusions are \
         sound is a reading someone has to do, and it does not survive a change to the estimator \
         just because the test stayed green.\n\n",
        WITHIN_1SE_RATE_FLOOR * 100.0,
        WITHIN_1SE_RATE_CEILING * 100.0,
    )
}

/// The per-θ table, the reading of it, and the account of what the residual
/// actually is.
///
/// The verdict is taken from the worst single θ, not from the aggregate. An
/// earlier version of this section decided from the aggregate mean signed
/// error and printed "not detectably biased" directly above its own table
/// showing that at θ = −3.5 almost every run sat on the same side: shrinkage
/// toward the centre is antisymmetric, so a symmetric sweep cancels it to
/// nearly nothing. An instrument that averages away the effect it was added
/// to catch is not an instrument.
fn per_theta_section(per_theta: &[(f64, Coverage)]) -> String {
    let worst = per_theta
        .iter()
        .max_by(|(_, a), (_, b)| {
            a.mean_signed_error
                .abs()
                .total_cmp(&b.mean_signed_error.abs())
        })
        .copied();

    let mut out = String::from("### Per true θ — where the residual lives\n\n");
    out.push_str(
        "**The residual is shrinkage toward the prior. The clamp is not involved, and the \
         sentence that used to say it was has been removed rather than softened.** That earlier \
         account — `theta_min` / `theta_max` clamp θ̂ at ±4.0, the sweep's outermost points sit \
         half a logit inside the wall, an estimator that cannot step past a wall is biased \
         inward near it — is false, and one run falsified it: with the wall moved to ±8.0 and \
         nothing else changed, 24 seeds × this 5-point sweep reproduced the signed error to four \
         decimal places at every point (+0.3203, +0.0981, −0.0735, −0.0798, −0.2813, both \
         settings) and the within-1-SE counts run for run (11, 16, 16, 15, 11 of 24, both \
         settings). Removing a cause changes nothing, so it was not the cause. The arithmetic \
         agrees: at a standard error near 0.26 the wall is about two standard errors away, and \
         clamping a normal two standard errors out moves its mean by about 0.002 — two orders of \
         magnitude short of what needs explaining.\n\n\
         What the table shows instead is monotone shrinkage toward the centre: θ̂ above the \
         truth at the bottom of the sweep, below it at the top. That is what a prior at θ = 0 \
         with `theta_prior_information` and a finite horizon produces, and it is there at ±1.5, \
         where no wall is within ten standard errors. That is measured too, not inferred: \
         weakening `theta_prior_information` from 1.0 to 0.05 and changing nothing else \
         collapsed the signed error at θ = −3.5 from +0.3203 to +0.0405 and at θ = +3.5 from \
         −0.2813 to −0.0945, with coverage improving at all five points. Weaken the prior and \
         the effect nearly disappears; move the wall and nothing happens at all.\n\n\
         Reported rather than tuned away, all the same: the prior's weight is what holds a \
         short-horizon estimate together, and trading that for a flatter column here is a \
         decision about who the estimate is for, which this file does not make.\n\n\
         Both quoted runs — the ±8.0 wall and the weakened prior — were measured once, during \
         the review of the fix that produced this report, at 24 seeds. They are quoted rather \
         than regenerated: only the sweep below is re-measured every time this file is \
         written.\n\n",
    );
    out.push_str("| true θ | within 1 SE | within 2 SE | mean signed error | mean abs error |\n");
    out.push_str("|---|---|---|---|---|\n");
    for (theta, c) in per_theta {
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

    if let Some((theta, c)) = worst {
        out.push_str(&format!(
            "The worst single θ is **{:+.1}**, at mean signed error {:+.4} against mean absolute \
             error {:.4}. {}\n\n",
            theta,
            c.mean_signed_error,
            c.mean_abs_error,
            if c.mean_signed_error.abs() > 0.5 * c.mean_abs_error {
                "At that θ the runs sit predominantly on one side of the truth: the estimate is \
                 biased there, not merely noisy. Find what is moving θ̂ in that direction; \
                 widening the interval would be treating a symptom. Whether a lean of this size \
                 at the edge of the sweep is worth correcting is a judgement about who the \
                 estimate is for, and this file does not make it."
            } else {
                "Even at its worst θ the runs scatter around the truth rather than sitting on \
                 one side of it — no bias is detectable at this sample size."
            },
        ));
    }

    out
}

/// Formats `COVERAGE.md`'s markdown, zero-argument on purpose: see
/// [`to_markdown`].
pub fn generate() -> Report {
    let theta_sweep = &THETA_SWEEP;
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
         **Read the signed error first, and read it per θ.** It is the column that separates a \
         noisy estimator from a biased one, and its absence is why this instrument once \
         misdiagnosed its own finding: absolute error alone cannot tell scatter around the truth \
         from a steady drag away from it, and only the second is a broken estimator. The \
         aggregate above is the weakest form of that reading, because an effect that changes \
         sign across a symmetric sweep nearly cancels in it — the table below is the one to \
         judge by.\n\n\
         `REPORT.md`'s own 3-seed measurement read 40% (6 of 15). {} runs at {:.1}% {} that \
         reading.\n\n",
        coverage.within_1se_rate() * 100.0,
        coverage.within_1se,
        coverage.runs,
        coverage.within_2se_rate() * 100.0,
        coverage.within_2se,
        coverage.runs,
        coverage.mean_abs_error,
        coverage.max_abs_error,
        coverage.mean_signed_error,
        coverage.runs,
        coverage.within_1se_rate() * 100.0,
        if (coverage.within_1se_rate() - 0.40).abs() < 0.10 {
            "confirms"
        } else {
            "revises"
        },
    ));

    out.push_str(&per_theta_section(&per_theta));

    out.push_str(&gate_band_section());

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
             sampling noise together with the shrinkage the per-θ table above measures. Not \
             toward the standard error's own construction: that was this file's earlier \
             diagnosis and the section below retracts it."
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
         **Why it survived two weeks is not that nobody saw the mechanism.** The mechanism was \
         written down, in this very file, the day before the fix: PR #48's addendum — now kept \
         whole in `PSEUDOWORD_DIVERGENCE.md` — states that the penalty \"never shrinks … it is \
         the same fixed `-0.3` on the thousandth over-claim as on the first,\" six inches below \
         a 13.0% coverage number, and then files it as \"a design question, not this addendum's \
         to answer\" and concludes \"this does not reopen anything merged.\" A signed-error \
         column would not have changed that; the column is worth having anyway, and it is now \
         above. What would have changed it is a rule: a named divergence between an \
         implementation and the brief that governs it is a defect until measured otherwise, and \
         it does not get to be a design question without an owner and a date.\n\n\
         **What is still open, and is not answered anywhere in this repository:** how large the \
         correction *should* be. `pseudoword_penalty` sets how far a total over-claimer is \
         marked down, and no measurement here fixes it — this simulator's over-claimer answers \
         real words honestly (`oracle::knows_real_item` reads only `true_theta` and \
         `difficulty`), so in simulation the correct correction is zero and any positive value \
         costs a little coverage. Calibrating the magnitude needs a synthetic learner whose \
         over-claiming also inflates real-word responses. Named as owed rather than guessed \
         at.\n\n\
         **The tripwire ADVISORY-005 §1 item 1 wrote in still holds:** nothing consumes \
         `theta_se`. The composer band reads θ̂, not its error. What has changed is that a \
         consumer landing tomorrow would inherit an estimator measured to be calibrated rather \
         than measured to be over-confident.\n",
    );

    out.push('\n');
    out.push_str(
        "---\n\nPR #48's analysis of the pseudoword correction used to sit at the foot of this \
         file. It is in `PSEUDOWORD_DIVERGENCE.md`, beside this one: everything above is \
         generated output, so hand-written prose cannot survive here. Its figures describe the \
         mechanism this report's last section says was replaced — they are the record of what \
         was measured then, kept because the postmortem above rests on them.\n",
    );

    Report {
        markdown: out,
        coverage,
    }
}

/// `COVERAGE.md`'s markdown.
///
/// **Why this lives in the library, not `bin/coverage.rs`.** `bin/coverage.rs`
/// calls this to print and write the committed file; `tests/coverage_gate.rs`
/// diffs the same generated text against the committed file, byte for byte —
/// the same discipline `main.rs`'s golden vectors already use. A
/// markdown-writer that only the binary can reach can drift from the committed
/// file the moment someone regenerates by hand and forgets a step; one function
/// two callers read cannot.
///
/// **And why it takes no arguments.** It used to take the θ sweep, and both
/// callers passed `THETA_SWEEP`. A third caller passing anything else would
/// have produced a file the byte-diff test rejects, so the parameter was an
/// invitation to disagree about the one input that must not vary.
pub fn to_markdown() -> String {
    generate().markdown
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
    fn the_report_prints_the_bounds_the_gate_asserts_on() {
        // The point of the section is that a reader of COVERAGE.md, and
        // `engine-contract` §5 citing it, get the gate's actual numbers. If
        // the constants stopped reaching the text, the citation would go back
        // to being a description.
        let section = gate_band_section();
        assert!(section.contains(&format!("{:.1}%", WITHIN_1SE_RATE_FLOOR * 100.0)));
        assert!(section.contains(&format!("{:.1}%", WITHIN_1SE_RATE_CEILING * 100.0)));
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
