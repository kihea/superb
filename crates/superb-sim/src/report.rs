//! The five assertions, computed from raw runs, and the one committed
//! report they format into.
//!
//! **The instruction this module exists to obey.** "Report the numbers,
//! never tune to make an assertion pass" (the brief's own words). Every
//! `*_report` function below computes exactly what it says and nothing more
//! — no function in this file adjusts a threshold, a seed, or a config value
//! based on what the numbers turn out to be. `main.rs` prints whatever comes
//! out; `tests/assertions.rs` asserts against the criteria this module
//! states, once, here.

use std::collections::BTreeMap;

use crate::pseudoword_comparison::{self, ComparisonResult};
use crate::simulation::{self, PoolTally, SimConfig, SimulationOutcome};
use crate::tuning_extract::AdrConstants;
use superb_core::Tuning;

/// Assertion 1 — θ̂ converges to the learner's true θ within its own
/// reported standard error, over the run's full horizon. Run across several seeds
/// and several true θ values, extremes included, and report the spread, not
/// just a pass.
pub struct Assertion1 {
    pub runs: Vec<ConvergenceRun>,
}

#[derive(Debug, Clone, Copy)]
pub struct ConvergenceRun {
    pub seed: u64,
    pub true_theta: f64,
    pub final_theta: f64,
    pub final_se: f64,
    pub abs_error: f64,
    pub within_se: bool,
}

impl Assertion1 {
    pub fn run(seeds: &[u64], true_thetas: &[f64], config: &SimConfig) -> Self {
        let mut runs = Vec::new();
        for &true_theta in true_thetas {
            for &seed in seeds {
                let outcome = simulation::run(seed, true_theta, config);
                let abs_error = (outcome.final_theta - true_theta).abs();
                runs.push(ConvergenceRun {
                    seed,
                    true_theta,
                    final_theta: outcome.final_theta,
                    final_se: outcome.final_theta_se,
                    abs_error,
                    within_se: abs_error <= outcome.final_theta_se,
                });
            }
        }
        Self { runs }
    }

    pub fn converged_count(&self) -> usize {
        self.runs.iter().filter(|r| r.within_se).count()
    }

    pub fn mean_abs_error(&self) -> f64 {
        mean(&self.runs.iter().map(|r| r.abs_error).collect::<Vec<_>>())
    }

    pub fn max_abs_error(&self) -> f64 {
        self.runs
            .iter()
            .map(|r| r.abs_error)
            .fold(0.0_f64, f64::max)
    }
}

/// Assertion 2 — the modal target word reaches `AUTOMATIC` in 8–12
/// varied-context encounters. `encounters` here counts every distinct
/// context frame a word was logged against before its first `AUTOMATIC` —
/// clean *and* gloss-tapped — not `superb-core`'s own internal
/// distinct-clean-frame count.
///
/// **Why that reading, stated once here.** `consolidating_threshold` (4) and
/// `encounter_target` (10, shipped) are literally the trigger: a word's
/// *distinct clean* frame count crosses `encounter_target` on the exact
/// session that count reaches 10, by construction — the state machine
/// cannot fire earlier or later, so measuring that count instead of this one
/// would report `10` for every word, every run, regardless of the learner's
/// ability. That would be a restatement of `tuning.toml`'s own number, not
/// an empirical finding, and this instrument exists to produce the latter.
/// Counting every context frame — gloss-tapped ones included — lets a weak
/// learner's real gloss-tap rate show up as a genuinely larger number, which
/// is the quantity "varied-context encounters" reads as in
/// `docs/engine-contract.md` §5's own prose.
pub struct Assertion2 {
    pub encounters: Vec<usize>,
}

impl Assertion2 {
    pub fn run(seeds: &[u64], true_theta: f64, config: &SimConfig) -> Self {
        let mut encounters = Vec::new();
        for &seed in seeds {
            let outcome = simulation::run(seed, true_theta, config);
            encounters.extend(outcome.encounters_to_automatic);
        }
        Self { encounters }
    }

    pub fn histogram(&self) -> BTreeMap<usize, usize> {
        let mut histogram = BTreeMap::new();
        for &value in &self.encounters {
            *histogram.entry(value).or_insert(0) += 1;
        }
        histogram
    }

    /// The most frequent encounter count, ties broken toward the smaller
    /// value — deterministic, and `None` when no word ever reached
    /// `AUTOMATIC` in the sampled runs.
    pub fn mode(&self) -> Option<usize> {
        self.histogram()
            .into_iter()
            .max_by_key(|&(value, count)| (count, std::cmp::Reverse(value)))
            .map(|(value, _)| value)
    }

    pub fn mean(&self) -> f64 {
        mean(
            &self
                .encounters
                .iter()
                .map(|&e| e as f64)
                .collect::<Vec<_>>(),
        )
    }

    pub fn median(&self) -> f64 {
        median(&self.encounters)
    }
}

/// Assertion 3 — the due list stays bounded over the run's full horizon. Report the
/// maximum reached and the session it peaked in.
pub struct Assertion3 {
    pub per_run: Vec<RunPeak>,
    pub vocabulary_size: usize,
}

#[derive(Debug, Clone, Copy)]
pub struct RunPeak {
    pub seed: u64,
    pub max_due: usize,
    pub peak_session: usize,
}

impl Assertion3 {
    pub fn from_outcomes(outcomes: &[SimulationOutcome], vocabulary_size: usize) -> Self {
        let per_run = outcomes
            .iter()
            .map(|outcome| {
                let (peak_session, &max_due) = outcome
                    .due_list_sizes
                    .iter()
                    .enumerate()
                    .max_by_key(|&(_, &size)| size)
                    .expect("a run always has at least one session");
                RunPeak {
                    seed: outcome.seed,
                    max_due,
                    peak_session,
                }
            })
            .collect();
        Self {
            per_run,
            vocabulary_size,
        }
    }

    pub fn max_due(&self) -> usize {
        self.per_run.iter().map(|r| r.max_due).max().unwrap_or(0)
    }

    /// Bounded means the schedule never let due words pile up to cover the
    /// whole vocabulary at once — the only threshold available without a
    /// number `docs/engine-contract.md` §5 does not itself state. Reported
    /// alongside `backlog_override_due` (the constant introduced expressly
    /// "to make the bounded-due-list assertion provable" —
    /// `scheduler.rs`'s own doc comment) for context, not as the pass
    /// criterion.
    pub fn stayed_bounded(&self) -> bool {
        self.max_due() < self.vocabulary_size
    }
}

/// Assertion 4 — the pseudoword correction shrinks θ for an over-claiming
/// learner, run across several seeds and true θ values.
pub struct Assertion4 {
    pub runs: Vec<ComparisonResult>,
}

impl Assertion4 {
    pub fn run(seeds: &[u64], true_thetas: &[f64], config: &SimConfig) -> Self {
        let mut runs = Vec::new();
        for &true_theta in true_thetas {
            for &seed in seeds {
                runs.push(pseudoword_comparison::run(seed, true_theta, config));
            }
        }
        Self { runs }
    }

    pub fn all_strict(&self) -> bool {
        self.runs
            .iter()
            .all(|r| r.overclaimer_final_theta < r.honest_final_theta)
    }

    pub fn mean_gap(&self) -> f64 {
        mean(
            &self
                .runs
                .iter()
                .map(|r| r.honest_final_theta - r.overclaimer_final_theta)
                .collect::<Vec<_>>(),
        )
    }
}

/// Assertion 5 — the falsifier ADVISORY-001 named: Assertion 3's
/// bounded-due-list property holds with ADR-015's sourced preference
/// active. Same runs as Assertion 3's canonical set, plus the pool tally
/// that proves the sourced path was genuinely exercised rather than left
/// configured and idle.
pub struct Assertion5 {
    pub bounded: bool,
    pub max_due: usize,
    pub pools: Vec<(u64, PoolTally)>,
}

impl Assertion5 {
    pub fn from_outcomes(outcomes: &[SimulationOutcome], vocabulary_size: usize) -> Self {
        let assertion3 = Assertion3::from_outcomes(outcomes, vocabulary_size);
        Self {
            bounded: assertion3.stayed_bounded(),
            max_due: assertion3.max_due(),
            pools: outcomes.iter().map(|o| (o.seed, o.pools)).collect(),
        }
    }

    pub fn sourced_sessions_total(&self) -> usize {
        self.pools
            .iter()
            .map(|(_, tally)| tally.sourced_sessions)
            .sum()
    }

    pub fn composed_sessions_total(&self) -> usize {
        self.pools
            .iter()
            .map(|(_, tally)| tally.composed_sessions)
            .sum()
    }

    pub fn sourced_preference_was_exercised(&self) -> bool {
        self.sourced_sessions_total() > 0
    }
}

fn mean(values: &[f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    values.iter().sum::<f64>() / values.len() as f64
}

fn median(values: &[usize]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let mut sorted = values.to_vec();
    sorted.sort_unstable();
    let mid = sorted.len() / 2;
    if sorted.len() % 2 == 0 {
        (sorted[mid - 1] + sorted[mid]) as f64 / 2.0
    } else {
        sorted[mid] as f64
    }
}

/// Every assertion's report, gathered for [`format_markdown`]. Built once
/// per `cargo run -p superb-sim` invocation, from the fixed seeds `main.rs`
/// names.
pub struct FullReport {
    pub assertion1: Assertion1,
    pub assertion2: Assertion2,
    pub assertion3: Assertion3,
    pub assertion4: Assertion4,
    pub assertion5: Assertion5,
    pub config: SimConfig,
    pub constants: AdrConstants,
}

impl FullReport {
    pub fn build(seeds: &[u64], theta_sweep: &[f64], config: SimConfig) -> Self {
        let tuning = Tuning::default();
        let constants = AdrConstants::from_tuning(&tuning);

        let assertion1 = Assertion1::run(seeds, theta_sweep, &config);
        let assertion2 = Assertion2::run(seeds, 0.0, &config);

        let canonical_outcomes: Vec<SimulationOutcome> = seeds
            .iter()
            .map(|&seed| simulation::run(seed, 0.0, &config))
            .collect();
        let assertion3 =
            Assertion3::from_outcomes(&canonical_outcomes, config.reading_vocabulary_size);
        let assertion4 = Assertion4::run(seeds, theta_sweep, &config);
        let assertion5 =
            Assertion5::from_outcomes(&canonical_outcomes, config.reading_vocabulary_size);

        Self {
            assertion1,
            assertion2,
            assertion3,
            assertion4,
            assertion5,
            config,
            constants,
        }
    }

    pub fn to_markdown(&self) -> String {
        let mut out = String::new();
        out.push_str("# BRIEF-014 simulator report\n\n");
        out.push_str(
            "Generated by `cargo run -p superb-sim`, from the fixed seeds `main.rs` names. \
             Same discipline as a golden vector: a future change's effect on the curve is a \
             diff against this file, not an argument.\n\n\
             **What this report is not.** The response model, the vocabulary, and the \
             composer were all written by the project whose scheduler they test. They \
             share its assumptions. This is the strongest instrument available before real \
             readers, and its numbers are evidence, not proof \
             (`docs/engine-contract.md` §5's own caveat, and BRIEF-014's).\n\n",
        );

        out.push_str(&format!(
            "Config: {} sessions, {}-word reading vocabulary, {} calibration words, {} \
             pseudowords, {:.0}% sourced-eligible, {} calibration draw(s)/session \
             ({:.0}% real), passage cap {} (composed) / {} (sourced).\n\n",
            self.config.sessions,
            self.config.reading_vocabulary_size,
            self.config.calibration_pool_size,
            self.config.pseudoword_pool_size,
            self.config.sourced_eligible_rate * 100.0,
            self.config.calibration_items_per_session,
            self.config.calibration_real_rate * 100.0,
            self.config.composed_cap,
            self.config.sourced_cap,
        ));

        self.write_assertion1(&mut out);
        self.write_assertion2(&mut out);
        self.write_assertion3(&mut out);
        self.write_assertion4(&mut out);
        self.write_assertion5(&mut out);

        out
    }

    fn write_assertion1(&self, out: &mut String) {
        out.push_str("## Assertion 1 — θ̂ converges within its own standard error\n\n");
        out.push_str(&format!(
            "{}/{} runs landed within their own reported standard error of the true θ. Mean \
             absolute error {:.4}, max absolute error {:.4}.\n\n",
            self.assertion1.converged_count(),
            self.assertion1.runs.len(),
            self.assertion1.mean_abs_error(),
            self.assertion1.max_abs_error(),
        ));
        out.push_str(&format!(
            "**Finding, reported rather than tuned away (BRIEF-014 round 3).** Round 1's \
             `theta_se` was a stored number decayed by a fixed factor on every observation \
             regardless of how informative it was (0/{total} runs landed within it). Round 2 \
             derived `theta_se` on every read as `1 / sqrt(total accumulated Fisher information)` \
             (`ability::update_theta`'s own doc comment) but left θ itself moving by a \
             fixed-size step (`theta_update_rate` times the residual) — an estimate and an \
             uncertainty produced by two different mechanisms, which only got 3/{total} runs \
             within band. Round 3 moves θ by Fisher scoring instead: the same residual divided \
             by the same accumulated information the derived SE reads, so the step shrinks as \
             evidence arrives and both numbers come from one calculation. \
             `theta_update_rate` bought nothing this scheme still needs and is retired from \
             `tuning.toml`. Each real-word calibration draw contributes `p * (1 - p)` of \
             information, and only calibration draws move θ at all; a session's \
             `PassageFinished` and `GlossTap` events never call `update_theta`. With \
             `calibration_items_per_session` = {calibration_items_per_session} and \
             `calibration_real_rate` = {calibration_real_rate:.0}%, the run carries roughly \
             {approx_real_draws:.0} real-word observations, and the reported se now lands \
             between {min_se:.3} and {max_se:.3}. {converged}/{total} runs now land within that \
             band — up from 3/{total} under the fixed-rate step — and mean absolute error fell \
             from 1.0448 (rounds 1-2) to {mean_abs_error:.4}, well below the no-update baseline \
             (mean |true θ| over the sweep), so θ̂ is both closer to the truth and better \
             calibrated to its own reported uncertainty than either earlier round.\n\n\
             **Round 4, 2026-07-27 — the gap this paragraph used to call \
             \"unexplained, not diagnosed\" is now diagnosed, and it was not any of the three \
             candidates listed here.** Those were the response model's sampling noise, the \
             horizon, and the Cramér-Rao bound; the wider sweep in `COVERAGE.md` ruled out the \
             horizon by making coverage *worse* at 3x, and the real answer was a fourth thing \
             nobody had listed: θ̂ was biased downward by the pseudoword correction. An \
             over-claimed pseudoword stepped θ down by a flat `pseudoword_penalty` that never \
             shrank, while the real-word step beside it was divided by accumulated Fisher \
             information and did — so past a few dozen observations the penalty dominated the \
             real evidence and dragged the estimate toward the clamp, while the reported \
             standard error went on tightening around it. The correction is now keyed to the \
             observed over-claim *rate* and bounded by `pseudoword_penalty` \
             (`ability::overclaim_correction`), applied where the estimate is read rather than \
             inside the recursion. Assertion 4 below still holds, now by construction and by \
             an exactly statable amount rather than by however far a run of fixed steps \
             happened to walk.\n\n\
             **What made it hard to see, recorded because it generalises:** this report and \
             `COVERAGE.md` both reported *absolute* error, which cannot tell an estimator \
             scattering around the truth from one being dragged to one side of it. \
             `COVERAGE.md` now reports mean signed error beside it, per true θ as well as in \
             aggregate. The per-run figures this paragraph used to quote by hand were removed \
             at the same time — hand-copied numbers inside a generated report are the same \
             drift this crate's own gate exists to prevent, and they had already gone \
             stale.\n\n\
             **The missing column is not why it survived, though, and saying so would be too \
             kind to us.** The mechanism was written down the day before the fix, in \
             `COVERAGE.md` itself and now in `PSEUDOWORD_DIVERGENCE.md` beside it: the penalty \
             \"never shrinks — it is the same fixed `-0.3` on the thousandth over-claim as on \
             the first,\" printed inches below a 13.0% coverage figure, and then filed as \"a \
             design question, not this addendum's to answer\" with \"this does not reopen \
             anything merged.\" Nobody failed to see it. What was missing was a rule: a named \
             divergence between an implementation and the brief that governs it is a defect \
             until measured otherwise, and it does not get to be a design question without an \
             owner and a date.\n\n",
            total = self.assertion1.runs.len(),
            calibration_items_per_session = self.config.calibration_items_per_session,
            calibration_real_rate = self.config.calibration_real_rate * 100.0,
            approx_real_draws = self.config.sessions as f64
                * self.config.calibration_items_per_session as f64
                * self.config.calibration_real_rate,
            min_se = self
                .assertion1
                .runs
                .iter()
                .map(|r| r.final_se)
                .fold(f64::INFINITY, f64::min),
            max_se = self
                .assertion1
                .runs
                .iter()
                .map(|r| r.final_se)
                .fold(0.0_f64, f64::max),
            converged = self.assertion1.converged_count(),
            mean_abs_error = self.assertion1.mean_abs_error(),
        ));
        out.push_str(
            "| seed | true θ | θ̂ | se | \\|error\\| | within se |\n|---|---|---|---|---|---|\n",
        );
        for run in &self.assertion1.runs {
            out.push_str(&format!(
                "| {} | {:.2} | {:.4} | {:.6} | {:.4} | {} |\n",
                run.seed,
                run.true_theta,
                run.final_theta,
                run.final_se,
                run.abs_error,
                run.within_se
            ));
        }
        out.push('\n');
    }

    fn write_assertion2(&self, out: &mut String) {
        out.push_str("## Assertion 2 — modal encounters to AUTOMATIC\n\n");
        let histogram = self.assertion2.histogram();
        out.push_str(&format!(
            "{} words reached AUTOMATIC across the sample. Mode {:?}, mean {:.2}, median {:.1}, \
             min {:?}, max {:?}.\n\n",
            self.assertion2.encounters.len(),
            self.assertion2.mode(),
            self.assertion2.mean(),
            self.assertion2.median(),
            self.assertion2.encounters.iter().min(),
            self.assertion2.encounters.iter().max(),
        ));
        out.push_str("| encounters | words |\n|---|---|\n");
        for (value, count) in &histogram {
            out.push_str(&format!("| {value} | {count} |\n"));
        }
        out.push('\n');
    }

    fn write_assertion3(&self, out: &mut String) {
        out.push_str("## Assertion 3 — the due list stays bounded\n\n");
        out.push_str(&format!(
            "Max due-list size across all runs: {} (of a {}-word vocabulary; \
             `backlog_override_due` = {}). Bounded (max < vocabulary size): {}.\n\n",
            self.assertion3.max_due(),
            self.assertion3.vocabulary_size,
            self.constants.backlog_override_due,
            self.assertion3.stayed_bounded(),
        ));
        out.push_str("| seed | max due | peak session |\n|---|---|---|\n");
        for run in &self.assertion3.per_run {
            out.push_str(&format!(
                "| {} | {} | {} |\n",
                run.seed, run.max_due, run.peak_session
            ));
        }
        out.push('\n');
    }

    fn write_assertion4(&self, out: &mut String) {
        out.push_str("## Assertion 4 — the pseudoword correction\n\n");
        out.push_str(&format!(
            "Overclaimer strictly below honest learner in {}/{} runs. Mean gap (honest − \
             overclaimer): {:.4}.\n\n\
             **Read the gap as a definition now, not a measurement.** The correction is \
             `pseudoword_penalty × over-claim rate`, and this harness contrasts a 100% claimer \
             with a 0% claimer, so the gap is exactly the penalty in every row and can only \
             move if `tuning.toml` moves. Under the old per-observation rule it was an \
             emergent number — 4.0077, however far a run of fixed steps happened to walk. What \
             still has content is the direction, which is what this assertion claims; the \
             half-claimer property BRIEF-010 asks for is covered by `ability`'s own \
             monotonicity test across claim rates 0..100, not by this table. Sweeping an \
             intermediate claim rate here would give the table back a measurement of its own, \
             and is not done.\n\n",
            self.assertion4
                .runs
                .iter()
                .filter(|r| r.overclaimer_final_theta < r.honest_final_theta)
                .count(),
            self.assertion4.runs.len(),
            self.assertion4.mean_gap(),
        ));
        out.push_str("| seed | true θ | overclaimer θ̂ | honest θ̂ | gap |\n|---|---|---|---|---|\n");
        for run in &self.assertion4.runs {
            out.push_str(&format!(
                "| {} | {:.2} | {:.4} | {:.4} | {:.4} |\n",
                run.seed,
                run.true_theta,
                run.overclaimer_final_theta,
                run.honest_final_theta,
                run.honest_final_theta - run.overclaimer_final_theta,
            ));
        }
        out.push('\n');
    }

    fn write_assertion5(&self, out: &mut String) {
        out.push_str(
            "## Assertion 5 — the bounded due list, with the sourced preference active\n\n",
        );
        out.push_str(&format!(
            "Max due-list size with `sourced_preference` = {} and the affinity table active: {} \
             (of a {}-word vocabulary). Bounded: {}. Sourced-pool sessions: {}, composed-pool \
             sessions: {} — the sourced preference was {}.\n\n",
            self.constants.sourced_preference,
            self.assertion5.max_due,
            self.assertion3.vocabulary_size,
            self.assertion5.bounded,
            self.assertion5.sourced_sessions_total(),
            self.assertion5.composed_sessions_total(),
            if self.assertion5.sourced_preference_was_exercised() {
                "genuinely exercised"
            } else {
                "never actually chosen — see UNRESOLVED"
            },
        ));
        out.push_str(
            "| seed | composed sessions | sourced sessions | idle sessions |\n|---|---|---|---|\n",
        );
        for (seed, tally) in &self.assertion5.pools {
            out.push_str(&format!(
                "| {} | {} | {} | {} |\n",
                seed, tally.composed_sessions, tally.sourced_sessions, tally.idle_sessions
            ));
        }
        out.push('\n');
    }
}
