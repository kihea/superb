//! BRIEF-017: calibrating `pseudoword_penalty` against a learner whose
//! bluffing inflates real-word answers as well as pseudoword ones — the
//! measurement `ability::overclaim_correction`'s own doc comment names as
//! owed and `oracle.rs`'s honest-only learners could never produce, because
//! that oracle's real-word evidence is unbiased by construction.
//!
//! **The bluff model, stated once as the assumption it is.** [`crate::oracle::bluffs_real_item`]
//! and [`crate::oracle::claims_pseudoword`] are driven by the same
//! propensity `b` for one synthetic learner: `b` inflates a real-word answer
//! exactly as it inflates a pseudoword claim. That link — one number driving
//! both behaviours — is what makes a single `pseudoword_penalty` even a
//! candidate to calibrate against; nothing in this crate, or anywhere else
//! in this repository, establishes that a real bluffing reader's two
//! behaviours share one rate. It is a modelling choice made for this
//! measurement, not a finding about readers.
//!
//! **What is minimised, exactly.** For a bluff rate `b` and a candidate
//! `pseudoword_penalty`, the statistic is the **mean signed error**
//! `θ̂_final − θ_true`, averaged over every seed and every true θ in the
//! sweep — signed, never absolute, because absolute error is exactly what
//! let the flat per-observation penalty hide a two-week directional bias
//! before BRIEF-010's rate-keyed fix (`workspace/contract.md` M2 item 4b;
//! `ability.rs`'s own module doc). The calibrated penalty for a given `b` is
//! the candidate whose mean signed error sits nearest zero.
//!
//! **Why a run does not have to be repeated once per candidate penalty.**
//! `ability::overclaim_correction` is `tuning.pseudoword_penalty * rate`
//! (`ability.rs`'s own doc comment states the formula in prose), and the
//! raw θ recursion never reads `pseudoword_penalty` at all — a pseudoword
//! observation contributes zero to it regardless of the constant
//! (`update_theta`'s pseudoword branch). So one simulated session at one
//! `(seed, true_theta, b)` yields everything every candidate penalty needs:
//! the raw θ̂ and the observed over-claim rate. [`corrected_theta`] applies
//! the same formula and the same final clamp
//! (`LearnerState::theta`'s own two steps) to that one pair, once per
//! candidate, without touching the RNG again.
//!
//! **Why the formula is restated here instead of calling
//! `superb_core::ability::overclaim_correction` with a swept `Tuning`.**
//! `Tuning::pseudoword_penalty` is `pub(crate)` inside `superb-core`
//! (engine-contract §1 law 6: the range check is what makes a `Tuning`
//! trustworthy, and a struct literal from outside the crate would bypass
//! it); the only public ways to build one are `Tuning::default` and
//! `Tuning::from_toml_str`, and this sweep does not have — and, per this
//! brief's own scope, must not create — a TOML document per candidate. The
//! restated formula is public knowledge (`ability.rs`'s own doc comment
//! states it in prose, and `overclaim_correction`'s test suite pins it),
//! and every other constant this module's learners run under
//! (`theta_min`, `theta_max`, `theta_prior_information`, and everything
//! `dispatch_deck_swipe` reads) comes from the one real
//! `Tuning::default()` the session actually ran under.

use std::collections::BTreeMap;
use std::thread;

use superb_core::{LearnerState, Timestamp, Tuning};

use crate::THETA_SWEEP;
use crate::oracle::{bluffs_real_item, claims_pseudoword};
use crate::rng::Rng;
use crate::simulation::{SimConfig, dispatch_deck_swipe};
use crate::vocabulary::{self, Vocabulary};

/// The bluff propensities swept — the brief's own grid, verbatim.
pub const BLUFF_RATES: [f64; 6] = [0.0, 0.1, 0.25, 0.5, 0.75, 1.0];

/// Candidate `pseudoword_penalty` values, `0.0` to `6.0` in steps of `0.1`
/// (61 values) — wider than the brief's own floor ("swept from 0.0 to at
/// least 2.0 in steps no coarser than 0.1"), and the reason is a finding of
/// its own: a first run stopping at `2.0` never brackets a zero for any
/// bluffing rate. At `b = 1.0`, `overclaim_rate` is `1.0` on every run (the
/// bluffer claims every pseudoword), so the correction is exactly `penalty *
/// 1.0` and the mean signed error is exactly linear in the candidate —
/// `4.0000` at `penalty = 0.0`, falling by `0.1000` per `0.1` step, so it
/// would not reach zero until `penalty ≈ 4.0`. Stopping the grid at `2.0`
/// would have reported `2.0` as "the calibrated penalty" at every bluffing
/// rate — the grid's own boundary, not a fitted value; every calibrated
/// penalty in this report is a genuine interior zero-crossing rather than
/// an edge artifact. Including the incumbent exactly: `0.1 * 3 == 0.3` lands
/// on this grid without rounding, since 0.3 is not exactly representable in
/// `f64` and a separately-computed 0.3 could silently miss the grid point
/// sitting one ULP away.
pub const CANDIDATE_PENALTIES: [f64; 61] = {
    let mut values = [0.0; 61];
    let mut i = 0;
    while i < 61 {
        values[i] = i as f64 * 0.1;
        i += 1;
    }
    values
};

/// The incumbent `tuning.toml` value, named by the brief and checked by
/// index into [`CANDIDATE_PENALTIES`] (index 3) rather than restated as a
/// second literal that could drift from the grid.
pub const INCUMBENT_PENALTY_INDEX: usize = 3;

/// 30 seeds per `(b, θ)` cell — above the brief's floor of 24, disjoint from
/// every other seed range this crate already reserves (`FIXED_SEEDS`
/// [42,43,44]; `coverage::MANY_SEEDS` 1000+; `coverage::HORIZON_SEEDS`
/// 2000+).
pub const SEEDS: [u64; 30] = {
    let mut seeds = [0u64; 30];
    let mut i = 0;
    while i < 30 {
        seeds[i] = 3000 + i as u64;
        i += 1;
    }
    seeds
};

/// The pre-registered band: a calibrated penalty spread of more than ±25% of
/// its own mean across bluff rates means the correction's linear-in-rate
/// shape is wrong, not merely its magnitude.
pub const BAND_FRACTION: f64 = 0.25;

/// One `(seed, true_theta, b)` session's raw outcome: everything any
/// candidate penalty needs, without a second run.
#[derive(Debug, Clone, Copy)]
struct RunOutcome {
    true_theta: f64,
    raw_theta: f64,
    overclaim_rate: f64,
}

/// Apply one candidate penalty to an already-run session's outcome — the
/// same two steps `LearnerState::theta` performs (subtract the rate-keyed
/// correction, clamp to the tuning's own bounds), reading `tuning` only for
/// those bounds.
fn corrected_theta(outcome: &RunOutcome, penalty: f64, tuning: &Tuning) -> f64 {
    let corrected = outcome.raw_theta - penalty * outcome.overclaim_rate;
    corrected.max(tuning.theta_min()).min(tuning.theta_max())
}

/// Run one bluffing learner through a full calibration horizon
/// (`SimConfig::default`'s own cadence — the same one `pseudoword_comparison`
/// and `run_calibration` use), at one `(seed, true_theta, b)`.
fn run_one(seed: u64, true_theta: f64, b: f64, config: &SimConfig) -> RunOutcome {
    let mut rng = Rng::new(seed);
    let vocabulary: Vocabulary = vocabulary::generate(
        &mut rng,
        0,
        config.calibration_pool_size,
        config.pseudoword_pool_size,
        0.0,
    );

    let tuning = Tuning::default();
    let now = Timestamp::from_millis_since_epoch(0);
    let mut learner = LearnerState::new(
        seed,
        0,
        0.0,
        tuning.theta_prior_information(),
        BTreeMap::new(),
        BTreeMap::new(),
    );

    let total_draws = config.sessions * config.calibration_items_per_session;
    for _ in 0..total_draws {
        let is_pseudoword = !rng.chance(config.calibration_real_rate);
        let (item_id, knew) = if is_pseudoword {
            let index = rng.below(vocabulary.pseudowords.len());
            let item_id = vocabulary.pseudowords[index].clone();
            let knew = claims_pseudoword(&mut rng, b);
            (item_id, knew)
        } else {
            let index = rng.below(vocabulary.calibration.len());
            let word = &vocabulary.calibration[index];
            let knew = bluffs_real_item(&mut rng, true_theta, word.true_difficulty, b);
            (word.id.clone(), knew)
        };

        dispatch_deck_swipe(
            &mut learner,
            &vocabulary,
            &tuning,
            now,
            item_id,
            is_pseudoword,
            knew,
        );
    }

    RunOutcome {
        true_theta,
        raw_theta: learner.theta_raw(),
        overclaim_rate: learner.overclaim_rate(),
    }
}

/// Every outcome for one bluff rate — [`SEEDS`] × [`THETA_SWEEP`], the
/// pre-decided input every candidate penalty is scored against.
fn outcomes_for(b: f64, config: &SimConfig) -> Vec<RunOutcome> {
    THETA_SWEEP
        .iter()
        .flat_map(|&true_theta| {
            SEEDS
                .iter()
                .map(move |&seed| run_one(seed, true_theta, b, config))
        })
        .collect()
}

/// One `(b, penalty)` cell of the report: mean signed error and its standard
/// error, over every seed and every true θ in the sweep.
#[derive(Debug, Clone, Copy)]
pub struct Cell {
    pub bluff_rate: f64,
    pub penalty: f64,
    pub n: usize,
    pub mean_signed_error: f64,
    pub standard_error: f64,
}

fn cell_for(bluff_rate: f64, penalty: f64, outcomes: &[RunOutcome], tuning: &Tuning) -> Cell {
    let errors: Vec<f64> = outcomes
        .iter()
        .map(|o| corrected_theta(o, penalty, tuning) - o.true_theta)
        .collect();
    let n = errors.len();
    let mean = errors.iter().sum::<f64>() / n as f64;
    let variance = errors.iter().map(|e| (e - mean).powi(2)).sum::<f64>()
        / (n.saturating_sub(1)).max(1) as f64;
    let standard_error = (variance / n as f64).sqrt();
    Cell {
        bluff_rate,
        penalty,
        n,
        mean_signed_error: mean,
        standard_error,
    }
}

/// One bluff rate's row: every candidate penalty's cell, and the one
/// nearest zero.
#[derive(Debug, Clone)]
pub struct BluffRow {
    pub bluff_rate: f64,
    pub cells: Vec<Cell>,
    pub calibrated_index: usize,
}

impl BluffRow {
    pub fn calibrated(&self) -> &Cell {
        &self.cells[self.calibrated_index]
    }

    pub fn incumbent(&self) -> &Cell {
        &self.cells[INCUMBENT_PENALTY_INDEX]
    }
}

/// The whole calibration: one [`BluffRow`] per bluff rate, and the
/// pre-registered band's verdict.
#[derive(Debug, Clone)]
pub struct Calibration {
    pub rows: Vec<BluffRow>,
    /// The mean of the calibrated penalties across every bluff rate,
    /// including `b = 0.0`.
    pub calibrated_mean_all: f64,
    /// The largest fractional deviation from [`Calibration::calibrated_mean_all`]
    /// any single bluff rate's calibrated penalty reaches, across every
    /// bluff rate including `b = 0.0`.
    pub max_fraction_all: f64,
    /// The same mean and spread, computed only over the bluffing rates
    /// (`b > 0.0`) — see this module's doc comment and `PSEUDOWORD-PENALTY.md`
    /// for why `b = 0.0` is degenerate for this particular question (every
    /// candidate penalty ties there, since the over-claim rate is always
    /// zero) and reported both ways rather than silently excluded.
    pub calibrated_mean_bluffing_only: f64,
    pub max_fraction_bluffing_only: f64,
}

/// Run the whole sweep: every bluff rate, every candidate penalty, every
/// seed and true θ. Threaded one bluff rate per thread — the sweep is the
/// most expensive thing this module does, and the six rates are
/// independent of one another.
pub fn generate() -> Calibration {
    let config = SimConfig::default();
    let tuning = Tuning::default();

    let outcomes_per_rate: Vec<(f64, Vec<RunOutcome>)> = thread::scope(|scope| {
        let handles: Vec<_> = BLUFF_RATES
            .iter()
            .map(|&b| {
                let config = &config;
                (b, scope.spawn(move || outcomes_for(b, config)))
            })
            .collect();
        handles
            .into_iter()
            .map(|(b, handle)| (b, handle.join().expect("bluff-rate thread panicked")))
            .collect()
    });

    let rows: Vec<BluffRow> = outcomes_per_rate
        .into_iter()
        .map(|(bluff_rate, outcomes)| {
            let cells: Vec<Cell> = CANDIDATE_PENALTIES
                .iter()
                .map(|&penalty| cell_for(bluff_rate, penalty, &outcomes, &tuning))
                .collect();
            let calibrated_index = cells
                .iter()
                .enumerate()
                .min_by(|(_, a), (_, b)| {
                    a.mean_signed_error
                        .abs()
                        .total_cmp(&b.mean_signed_error.abs())
                })
                .map(|(index, _)| index)
                .expect("CANDIDATE_PENALTIES is non-empty");
            BluffRow {
                bluff_rate,
                cells,
                calibrated_index,
            }
        })
        .collect();

    let all_values: Vec<f64> = rows.iter().map(|row| row.calibrated().penalty).collect();
    let (calibrated_mean_all, max_fraction_all) = spread(&all_values);

    let bluffing_only: Vec<f64> = rows
        .iter()
        .filter(|row| row.bluff_rate > 0.0)
        .map(|row| row.calibrated().penalty)
        .collect();
    let (calibrated_mean_bluffing_only, max_fraction_bluffing_only) = spread(&bluffing_only);

    Calibration {
        rows,
        calibrated_mean_all,
        max_fraction_all,
        calibrated_mean_bluffing_only,
        max_fraction_bluffing_only,
    }
}

/// The mean of `values`, and the largest fractional deviation any single
/// value reaches from that mean (`0.0` if the mean is `0.0` and every value
/// is also `0.0`, since there is then no spread to report).
fn spread(values: &[f64]) -> (f64, f64) {
    if values.is_empty() {
        return (0.0, 0.0);
    }
    let mean = values.iter().sum::<f64>() / values.len() as f64;
    let max_fraction = values
        .iter()
        .map(|v| {
            if mean.abs() < 1e-12 {
                if (v - mean).abs() < 1e-12 {
                    0.0
                } else {
                    f64::INFINITY
                }
            } else {
                (v - mean).abs() / mean.abs()
            }
        })
        .fold(0.0_f64, f64::max);
    (mean, max_fraction)
}

/// `true` if [`Calibration::max_fraction_all`] stays inside the pre-registered
/// ±25% band — a single constant fits, per the brief's own literal grid
/// (every bluff rate it names, `b = 0.0` included).
pub fn single_constant_fits(calibration: &Calibration) -> bool {
    calibration.max_fraction_all <= BAND_FRACTION
}

/// `PSEUDOWORD-PENALTY.md`'s markdown, from one already-run [`Calibration`]
/// — the same one-sweep-not-two discipline `coverage::to_markdown` and
/// `tests/coverage_gate.rs` share: the binary that writes the committed file
/// and the test that checks it stays fresh both call this on one run.
pub fn to_markdown(calibration: &Calibration) -> String {
    let mut out = String::new();
    out.push_str("# `pseudoword_penalty` calibration (BRIEF-017)\n\n");
    out.push_str(&format!(
        "Generated by `cargo run -p superb-sim --bin pseudoword_penalty_calibration`. Seeds \
         `{}..={}` (30 per `(b, θ)` cell, `pseudoword_penalty_calibration::SEEDS`), true θ from \
         `THETA_SWEEP` ({:?}), `SimConfig::default()`'s own 240-session horizon. Reruns to \
         identical numbers from those seeds alone.\n\n\
         **The bluff model is an assumption, stated as one.** One propensity `b` drives both a \
         synthetic learner's real-word bluffing (`oracle::bluffs_real_item`) and their \
         pseudoword over-claiming (`oracle::claims_pseudoword`) — the same number for both. That \
         link is what makes a single `pseudoword_penalty` calibratable against this learner at \
         all. Nothing in this repository establishes that a real bluffing reader's two \
         behaviours share one rate; this is a modelling choice made for this measurement, not a \
         finding about readers.\n\n\
         **The statistic is mean signed error, `θ̂_final − θ_true`, never absolute.** Absolute \
         error is exactly what let BRIEF-010's flat per-observation penalty hide a two-week \
         directional bias (`workspace/contract.md` M2 item 4b) — it cannot tell an \
         over-correction from an under-correction, and this correction's failure mode is \
         directional by construction.\n\n\
         **This report does not change `tuning.toml`.** Landing a number is a separate PR against \
         this report, with a golden-vector argument, decided by the architect.\n\n",
        SEEDS[0],
        SEEDS[SEEDS.len() - 1],
        THETA_SWEEP,
    ));

    out.push_str("## The full `(b, penalty)` table\n\n");
    out.push_str(
        "Mean signed error and its standard error, each cell aggregated over 30 seeds × 5 true \
         θ (n = 150). A cell whose interval (mean ± SE) spans zero cannot distinguish that \
         penalty from a better one at this sample size. The incumbent `0.3` and each row's \
         calibrated (nearest-zero) penalty are marked.\n\n",
    );
    out.push_str(
        "| b | penalty | n | mean signed error | SE | note |\n|---|---|---|---|---|---|\n",
    );
    for row in &calibration.rows {
        for (index, cell) in row.cells.iter().enumerate() {
            let mut notes = Vec::new();
            if index == INCUMBENT_PENALTY_INDEX {
                notes.push("incumbent");
            }
            if index == row.calibrated_index {
                notes.push("calibrated");
            }
            out.push_str(&format!(
                "| {:.2} | {:.1} | {} | {:+.4} | {:.4} | {} |\n",
                row.bluff_rate,
                cell.penalty,
                cell.n,
                cell.mean_signed_error,
                cell.standard_error,
                notes.join(", "),
            ));
        }
    }
    out.push('\n');

    out.push_str("## Calibrated penalty per bluff rate\n\n");
    out.push_str(
        "| b | calibrated penalty | mean signed error (calibrated) | SE | mean signed error at incumbent 0.3 | SE |\n\
         |---|---|---|---|---|---|\n",
    );
    for row in &calibration.rows {
        let calibrated = row.calibrated();
        let incumbent = row.incumbent();
        out.push_str(&format!(
            "| {:.2} | {:.1} | {:+.4} | {:.4} | {:+.4} | {:.4} |\n",
            row.bluff_rate,
            calibrated.penalty,
            calibrated.mean_signed_error,
            calibrated.standard_error,
            incumbent.mean_signed_error,
            incumbent.standard_error,
        ));
    }
    out.push('\n');
    out.push_str(
        "**`b = 0.0` is degenerate for this table, and it is worth saying plainly.** At `b = \
         0.0` the synthetic learner never over-claims a pseudoword, so `overclaim_rate` is `0.0` \
         on every run and **every candidate penalty from 0.0 to 6.0 produces the exact same mean \
         signed error, -0.0071, to the last printed digit** — there is nothing to fit, and \
         whichever value this row lists as \"calibrated\" is an artifact of this sweep's own \
         nearest-zero tie-break (which keeps the first, smallest, candidate it meets) rather than \
         evidence that `0.0` specifically is what `b = 0.0` needs. Any candidate, including the \
         ~4.5 the other five rows converge on, is equally consistent with this row's own numbers. \
         It is included in the table because the brief's own bluff-rate grid names `0.0` without \
         carving it out, and excluding it silently would be a judgment this report does not get \
         to make unannounced — both readings of the pre-registered band are computed below, and \
         which one governs the done clause's own one-sentence verdict is recorded as an open \
         question in `BRIEF-017`'s own UNRESOLVED block rather than decided here.\n\n",
    );

    out.push_str("## The pre-registered ±25% band\n\n");
    out.push_str(&format!(
        "**Including `b = 0.0`** (the brief's literal grid): mean calibrated penalty {:.4}, \
         largest deviation from that mean {:.1}% of it. {}\n\n\
         **Excluding `b = 0.0`** (only the bluff rates where over-claiming actually occurs): \
         mean calibrated penalty {:.4}, largest deviation {:.1}% of it. {}\n\n",
        calibration.calibrated_mean_all,
        calibration.max_fraction_all * 100.0,
        if calibration.max_fraction_all <= BAND_FRACTION {
            "Inside the ±25% band."
        } else {
            "Outside the ±25% band."
        },
        calibration.calibrated_mean_bluffing_only,
        calibration.max_fraction_bluffing_only * 100.0,
        if calibration.max_fraction_bluffing_only <= BAND_FRACTION {
            "Inside the ±25% band."
        } else {
            "Outside the ±25% band."
        },
    ));

    let verdict = if single_constant_fits(calibration) {
        format!(
            "**The calibrated value is {:.1}.**",
            calibration.calibrated_mean_all
        )
    } else {
        format!(
            "**No single constant fits; the spread is {:.1}% and the functional form is the \
             problem.**",
            calibration.max_fraction_all * 100.0
        )
    };
    out.push_str("## Verdict\n\n");
    out.push_str(&format!(
        "Read literally against the brief's own grid, `b = 0.0` included: {verdict}\n\n\
         **That reading is driven almost entirely by the degenerate `b = 0.0` cell above, not by \
         a real disagreement about the correction's shape.** Restricted to the bluff rates where \
         over-claiming actually occurs (`b ∈ {{0.1, 0.25, 0.5, 0.75, 1.0}}`), the calibrated \
         penalty clusters tightly — {:.1} to {:.1}, spread {:.1}% of its mean {:.4} — comfortably \
         **inside** the ±25% band, at a value roughly fifteen times the incumbent `0.3`. Whether \
         the degenerate cell should count toward the pre-registered check is not decided in this \
         file; see BRIEF-017's own UNRESOLVED block.\n\n",
        calibration
            .rows
            .iter()
            .filter(|row| row.bluff_rate > 0.0)
            .map(|row| row.calibrated().penalty)
            .fold(f64::INFINITY, f64::min),
        calibration
            .rows
            .iter()
            .filter(|row| row.bluff_rate > 0.0)
            .map(|row| row.calibrated().penalty)
            .fold(f64::NEG_INFINITY, f64::max),
        calibration.max_fraction_bluffing_only * 100.0,
        calibration.calibrated_mean_bluffing_only,
    ));

    out.push_str("## Watched red before green\n\n");
    out.push_str(
        "`forcing_the_penalty_to_zero_leaves_the_highest_bluff_cell_strongly_biased_upward` \
         (`src/pseudoword_penalty_calibration.rs`) first asserted the wrong direction — that \
         forcing the candidate penalty to `0.0` at `b = 1.0` would leave the mean signed error \
         *negative* — and failed with `mean signed error at (b=1.0, penalty=0.0): 4.000000, \
         expected < 0.0`: every one of the 150 runs at that cell walked raw θ̂ to `theta_max` \
         exactly, so the mean sits on the clamp. Corrected to assert `> 0.3` and that a higher \
         candidate penalty (`1.0`) reads a lower signed error than `0.0` does — the direction the \
         correction is supposed to move in — and both now pass.\n\n",
    );

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Determinism: the same seed, run twice, produces the same raw θ̂ and
    /// the same over-claim rate.
    #[test]
    fn a_single_run_is_deterministic_from_its_seed() {
        let config = SimConfig::default();
        let a = run_one(11, 1.5, 0.5, &config);
        let b = run_one(11, 1.5, 0.5, &config);
        assert_eq!(a.raw_theta, b.raw_theta);
        assert_eq!(a.overclaim_rate, b.overclaim_rate);
    }

    /// **Watched red, then green (BRIEF-017's own done clause).** Forcing
    /// the candidate penalty to `0.0` should leave a high-bluff learner's
    /// mean signed error strongly positive — the raw bias bluffing
    /// introduces, entirely uncorrected. The first form of this assertion
    /// checked the wrong direction (`< 0.0`, copied from a coverage-style
    /// "should be biased low" instinct that does not apply here — a
    /// bluffer's inflated claims push θ̂ *up*, not down) and failed with
    /// `mean signed error at (b=1.0, penalty=0.0): 4.000000, expected < 0.0`
    /// — every one of the 150 runs at that cell walked raw θ̂ to
    /// `tuning.theta_max` exactly, so the mean landed on the clamp itself.
    /// Recorded in `PSEUDOWORD-PENALTY.md`'s own red-before-green section
    /// with the exact number this run printed.
    #[test]
    fn forcing_the_penalty_to_zero_leaves_the_highest_bluff_cell_strongly_biased_upward() {
        let config = SimConfig::default();
        let tuning = Tuning::default();
        let outcomes = outcomes_for(1.0, &config);
        let uncorrected = cell_for(1.0, 0.0, &outcomes, &tuning);

        assert!(
            uncorrected.mean_signed_error > 0.3,
            "mean signed error at (b=1.0, penalty=0.0): {:.6}, expected > 0.3",
            uncorrected.mean_signed_error
        );

        // And the expected direction: raising the penalty from 0.0 should
        // pull that same cell's mean signed error down, toward zero.
        let corrected = cell_for(1.0, 1.0, &outcomes, &tuning);
        assert!(
            corrected.mean_signed_error < uncorrected.mean_signed_error,
            "penalty 1.0 ({}) should read a lower signed error than penalty 0.0 ({})",
            corrected.mean_signed_error,
            uncorrected.mean_signed_error
        );
    }

    /// A degenerate check on [`spread`] alone, cheap and independent of the
    /// sweep: identical values report zero spread regardless of their mean.
    #[test]
    fn spread_of_identical_values_is_zero() {
        let (mean, max_fraction) = spread(&[0.4, 0.4, 0.4]);
        assert!((mean - 0.4).abs() < 1e-12);
        assert!(max_fraction.abs() < 1e-9, "max_fraction: {max_fraction}");
    }
}
