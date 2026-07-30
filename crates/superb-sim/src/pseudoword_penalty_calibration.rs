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
//!
//! **The architect's ruling on question 6 (2026-07-30), addressed by this
//! module's `Admissibility` and `SaturationCell`/`SaturationRow` types.** The
//! ±25% band is not checked over a set of bluff rates anyone chose after
//! seeing the numbers — it is checked over exactly the rows a mechanical
//! rule keeps: mean signed error must be a non-constant function of the
//! candidate penalty (clause 1), and the *uncorrected* θ̂ must still vary
//! with true ability rather than sitting against the clamp regardless of it
//! (clause 2). Both are properties of the run, checked from the data, never
//! anyone's opinion. See `PSEUDOWORD-PENALTY.md`'s own "Admissibility"
//! section for the worked table and the resulting Verdict.

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

/// A property is treated as "identically constant" (clause 1) or "not
/// varying with true ability" (clause 2) once its spread across the swept
/// grid falls below this — not a tolerance chosen to flatter either
/// reading, but the floor floating-point summation noise sits under across
/// 150-run means in this sweep (the degenerate cells in this report tie to
/// four printed decimal places, i.e. spreads under `1e-4`; `1e-9` is
/// generous headroom below that, not a threshold anyone had to tune to get
/// the answer they wanted).
const DEGENERACY_EPSILON: f64 = 1e-9;

/// Above this ever-saturated fraction, a clamp-hit inside the admissible
/// cluster is read as "biting" rather than "low" in the Verdict section —
/// the one number in this module that is a judgment call rather than a
/// derivation, escalated as such in `BRIEF-017`'s own UNRESOLVED block and in
/// the PR: 5% is chosen as a conservative floor under which a handful of
/// unlucky seeds walking briefly into the clamp is not read as contaminating
/// the row's calibrated value, and above which it is.
const NONTRIVIAL_CLAMP_HIT_THRESHOLD: f64 = 0.05;

/// One `(seed, true_theta, b)` session's raw outcome: everything any
/// candidate penalty needs, without a second run.
///
/// `raw_saturated_ever` and `raw_saturated_final` answer the architect's
/// ruling on question 6: whether the *uncorrected* θ̂ — the raw recursion,
/// before `pseudoword_penalty` is ever subtracted — ever walked into
/// `theta_min`/`theta_max`, and whether it was still pinned there at the run's
/// last observation. `LearnerState::theta_raw` is itself clamped by
/// `ability::update_theta` after every draw (`ability.rs` line ~264), so
/// checking it for exact equality with the tuning's own bounds after each
/// swipe is sufficient — no new instrumentation is needed inside
/// `superb-core`, which stays exactly as pure as it was before this brief.
#[derive(Debug, Clone, Copy)]
struct RunOutcome {
    true_theta: f64,
    raw_theta: f64,
    overclaim_rate: f64,
    raw_saturated_ever: bool,
    raw_saturated_final: bool,
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
    let mut raw_saturated_ever = false;
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

        let raw = learner.theta_raw();
        if raw <= tuning.theta_min() || raw >= tuning.theta_max() {
            raw_saturated_ever = true;
        }
    }

    let raw_theta = learner.theta_raw();
    let raw_saturated_final = raw_theta <= tuning.theta_min() || raw_theta >= tuning.theta_max();

    RunOutcome {
        true_theta,
        raw_theta,
        overclaim_rate: learner.overclaim_rate(),
        raw_saturated_ever,
        raw_saturated_final,
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

/// Per-`(b, θ_true)` saturation diagnostics — the architect's ruling on
/// question 6, addition 1. Broken out by true ability rather than folded
/// into one number per bluff rate, because clause 2 of the admissibility
/// rule below is a question about *whether raw θ̂ still tracks true ability*,
/// and a single aggregate fraction cannot answer that on its own.
#[derive(Debug, Clone, Copy)]
pub struct SaturationCell {
    pub true_theta: f64,
    pub n: usize,
    /// Fraction of this sub-cell's runs whose *uncorrected* θ̂ reached
    /// `theta_max` or `theta_min` at any point during the run.
    pub ever_saturated_fraction: f64,
    /// Fraction still pinned there at the run's final observation.
    pub final_saturated_fraction: f64,
}

/// One bluff rate's saturation row: every true-θ sub-cell.
#[derive(Debug, Clone)]
pub struct SaturationRow {
    pub bluff_rate: f64,
    pub cells: Vec<SaturationCell>,
    /// The same two fractions, aggregated over the whole row (n = 150) —
    /// what the admissibility rule's clause 2 caveat prints beside an
    /// admissible cell's calibrated value.
    pub ever_saturated_fraction: f64,
    pub final_saturated_fraction: f64,
}

fn saturation_row(bluff_rate: f64, outcomes: &[RunOutcome]) -> SaturationRow {
    let cells: Vec<SaturationCell> = THETA_SWEEP
        .iter()
        .map(|&true_theta| {
            let group: Vec<&RunOutcome> = outcomes
                .iter()
                .filter(|o| o.true_theta == true_theta)
                .collect();
            let n = group.len();
            let ever = group.iter().filter(|o| o.raw_saturated_ever).count() as f64 / n as f64;
            let final_ = group.iter().filter(|o| o.raw_saturated_final).count() as f64 / n as f64;
            SaturationCell {
                true_theta,
                n,
                ever_saturated_fraction: ever,
                final_saturated_fraction: final_,
            }
        })
        .collect();
    let n_total = outcomes.len();
    let ever_saturated_fraction =
        outcomes.iter().filter(|o| o.raw_saturated_ever).count() as f64 / n_total as f64;
    let final_saturated_fraction =
        outcomes.iter().filter(|o| o.raw_saturated_final).count() as f64 / n_total as f64;
    SaturationRow {
        bluff_rate,
        cells,
        ever_saturated_fraction,
        final_saturated_fraction,
    }
}

/// The admissibility rule from the architect's ruling on question 6,
/// stated as a mechanical property of the *run*, never of the outcome:
///
/// 1. Mean signed error must be a non-constant function of the candidate
///    penalty across the swept grid — `b = 0.0` fails, because the
///    correction term (`penalty * overclaim_rate`) is identically zero when
///    `overclaim_rate` is always zero, so every candidate ties.
/// 2. The *uncorrected* θ̂ must still vary with true ability rather than
///    sitting against `theta_max`/`theta_min` regardless of it — `b = 1.0`
///    fails, because raw θ̂ pins at `theta_max` on every run no matter what
///    true θ was.
///
/// Both clauses are checked from the data; neither is anyone's opinion.
#[derive(Debug, Clone, Copy)]
pub struct Admissibility {
    pub bluff_rate: f64,
    pub admissible: bool,
    pub clause1_varies_with_penalty: bool,
    /// The spread (max − min) of mean signed error across every candidate
    /// penalty in the row — the number that disqualifies a row failing
    /// clause 1 (it reads ~`0.0`).
    pub clause1_spread: f64,
    pub clause2_varies_with_true_theta: bool,
    /// The spread (max − min) of the mean raw (uncorrected) θ̂ across the
    /// five `THETA_SWEEP` groups — the number that disqualifies a row
    /// failing clause 2 (it reads ~`0.0`, meaning raw θ̂ does not move even
    /// though true ability does across the grid).
    pub clause2_raw_spread_across_true_theta: f64,
}

fn admissibility(bluff_rate: f64, cells: &[Cell], outcomes: &[RunOutcome]) -> Admissibility {
    admissibility_with_epsilon(bluff_rate, cells, outcomes, DEGENERACY_EPSILON)
}

/// [`admissibility`], parameterised on the epsilon that decides "constant
/// enough to fail a clause" — split out so a test can deliberately supply the
/// wrong one and watch the rule misjudge a row before trusting the real
/// constant.
fn admissibility_with_epsilon(
    bluff_rate: f64,
    cells: &[Cell],
    outcomes: &[RunOutcome],
    epsilon: f64,
) -> Admissibility {
    let signed_errors: Vec<f64> = cells.iter().map(|c| c.mean_signed_error).collect();
    let clause1_spread = signed_errors.iter().cloned().fold(f64::MIN, f64::max)
        - signed_errors.iter().cloned().fold(f64::MAX, f64::min);
    let clause1_varies_with_penalty = clause1_spread > epsilon;

    let group_means: Vec<f64> = THETA_SWEEP
        .iter()
        .map(|&true_theta| {
            let group: Vec<f64> = outcomes
                .iter()
                .filter(|o| o.true_theta == true_theta)
                .map(|o| o.raw_theta)
                .collect();
            group.iter().sum::<f64>() / group.len() as f64
        })
        .collect();
    let clause2_raw_spread_across_true_theta = group_means.iter().cloned().fold(f64::MIN, f64::max)
        - group_means.iter().cloned().fold(f64::MAX, f64::min);
    let clause2_varies_with_true_theta = clause2_raw_spread_across_true_theta > epsilon;

    Admissibility {
        bluff_rate,
        admissible: clause1_varies_with_penalty && clause2_varies_with_true_theta,
        clause1_varies_with_penalty,
        clause1_spread,
        clause2_varies_with_true_theta,
        clause2_raw_spread_across_true_theta,
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
    /// The same mean and spread, computed only over the "free" cells — bluff
    /// rates where over-claiming happens (`bluff_rate > 0.0`) *and* the
    /// estimate is not pinned against `theta_max` (`bluff_rate < 1.0`). At
    /// `b = 1.0` every one of the 150 runs saturates the clamp regardless of
    /// true θ, which is a different but structurally equal degeneracy to
    /// `b = 0.0`'s (see `PSEUDOWORD-PENALTY.md`): a uniform raw signal
    /// produces a uniform corrected value for any penalty, so that cell's
    /// zero-crossing is an equation about the clamp and the grid's own
    /// symmetry, not about the correction's dynamics.
    pub calibrated_mean_free_cells: f64,
    pub max_fraction_free_cells: f64,
    /// Per-`(b, θ_true)` saturation diagnostics — architect's ruling on
    /// question 6, addition 1.
    pub saturation_rows: Vec<SaturationRow>,
    /// Every bluff rate marked ADMISSIBLE or INADMISSIBLE by the mechanical
    /// rule — addition 2.
    pub admissibility: Vec<Admissibility>,
    /// The pre-registered band, recomputed over exactly the rows the
    /// admissibility rule keeps — by rule, not by anyone's choice.
    pub admissible_calibrated_mean: f64,
    pub admissible_max_fraction: f64,
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

    let mut rows: Vec<BluffRow> = Vec::with_capacity(BLUFF_RATES.len());
    let mut saturation_rows: Vec<SaturationRow> = Vec::with_capacity(BLUFF_RATES.len());
    let mut admissibility_rows: Vec<Admissibility> = Vec::with_capacity(BLUFF_RATES.len());

    for (bluff_rate, outcomes) in &outcomes_per_rate {
        let cells: Vec<Cell> = CANDIDATE_PENALTIES
            .iter()
            .map(|&penalty| cell_for(*bluff_rate, penalty, outcomes, &tuning))
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

        admissibility_rows.push(admissibility(*bluff_rate, &cells, outcomes));
        saturation_rows.push(saturation_row(*bluff_rate, outcomes));

        rows.push(BluffRow {
            bluff_rate: *bluff_rate,
            cells,
            calibrated_index,
        });
    }

    let all_values: Vec<f64> = rows.iter().map(|row| row.calibrated().penalty).collect();
    let (calibrated_mean_all, max_fraction_all) = spread(&all_values);

    let bluffing_only: Vec<f64> = rows
        .iter()
        .filter(|row| row.bluff_rate > 0.0)
        .map(|row| row.calibrated().penalty)
        .collect();
    let (calibrated_mean_bluffing_only, max_fraction_bluffing_only) = spread(&bluffing_only);

    let free_cells: Vec<f64> = rows
        .iter()
        .filter(|row| row.bluff_rate > 0.0 && row.bluff_rate < 1.0)
        .map(|row| row.calibrated().penalty)
        .collect();
    let (calibrated_mean_free_cells, max_fraction_free_cells) = spread(&free_cells);

    let admissible_values: Vec<f64> = rows
        .iter()
        .zip(admissibility_rows.iter())
        .filter(|(_, admissibility)| admissibility.admissible)
        .map(|(row, _)| row.calibrated().penalty)
        .collect();
    let (admissible_calibrated_mean, admissible_max_fraction) = spread(&admissible_values);

    Calibration {
        rows,
        calibrated_mean_all,
        max_fraction_all,
        calibrated_mean_bluffing_only,
        max_fraction_bluffing_only,
        calibrated_mean_free_cells,
        max_fraction_free_cells,
        saturation_rows,
        admissibility: admissibility_rows,
        admissible_calibrated_mean,
        admissible_max_fraction,
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

/// `true` if [`Calibration::admissible_max_fraction`] stays inside the
/// pre-registered ±25% band, computed over exactly the bluff rates the
/// mechanical admissibility rule keeps — never over a set anyone chose after
/// looking at the numbers.
pub fn admissible_cluster_fits(calibration: &Calibration) -> bool {
    calibration.admissible_max_fraction <= BAND_FRACTION
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
         to make unannounced — the three readings of the pre-registered band below are kept for \
         the record, and the Admissibility section further down states, mechanically rather than \
         by anyone's choice, exactly why this row cannot inform the constant (clause 1: mean \
         signed error is identically constant in the candidate penalty).\n\n",
    );
    out.push_str(
        "**`b = 1.0` is degenerate too, and for the mirror-image reason.** At `b = 1.0` raw θ̂ \
         walks to `theta_max` (4.0) on every one of the 150 runs, regardless of true θ, seed, or \
         session — the bluffer claims every pseudoword, so `overclaim_rate` is exactly `1.0` and \
         the raw signal is pinned against the clamp before any correction is applied. The \
         correction is then exactly `penalty × 1.0`, so the mean signed error is exactly `4.0 − \
         penalty`, and it reaches zero at exactly `penalty = theta_max − mean(THETA_SWEEP) = 4.0 \
         − 0.0 = 4.0` — this row's \"calibrated\" value would read `4.0` whatever the true answer \
         were, because it is solving an equation about the clamp and the grid's own symmetry, not \
         about the correction's dynamics. The Admissibility section below marks this row \
         INADMISSIBLE under clause 2 for exactly this reason. The two degeneracies are mirror \
         images of each other — at `b = 0.0` the term under test is multiplied by zero, at `b = \
         1.0` the quantity the correction is meant to recover is pinned against a wall — and \
         neither could have answered the pre-registered question, both provable from algebra alone \
         before any run.\n\n",
    );

    out.push_str("## The pre-registered ±25% band\n\n");
    out.push_str(&format!(
        "**Including `b = 0.0`** (the brief's literal grid): mean calibrated penalty {:.4}, \
         largest deviation from that mean {:.1}% of it. {}\n\n\
         **Excluding `b = 0.0`** (only the bluff rates where over-claiming actually occurs): \
         mean calibrated penalty {:.4}, largest deviation {:.1}% of it. {}\n\n\
         **Excluding both degenerate cells** (`b ∈ {{0.1, 0.25, 0.5, 0.75}}` — the only rates \
         where over-claiming happens and the estimate is not pinned against the clamp): mean \
         calibrated penalty {:.4}, largest deviation {:.1}% of it. {} These three readings are \
         kept for the record; the architect's ruling on question 6 replaces the choice between \
         them with the mechanical admissibility rule below, and the reading that now governs the \
         Verdict section is whichever rows that rule keeps, not any of these three named sets.\n\n",
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
        calibration.calibrated_mean_free_cells,
        calibration.max_fraction_free_cells * 100.0,
        if calibration.max_fraction_free_cells <= BAND_FRACTION {
            "Inside the ±25% band."
        } else {
            "Outside the ±25% band."
        },
    ));

    out.push_str("## Per-`(b, θ_true)` saturation diagnostics\n\n");
    out.push_str(
        "Architect's ruling on question 6, addition 1. For every `(b, θ_true)` sub-cell (30 \
         seeds): the fraction of runs whose *uncorrected* θ̂ reached `theta_max` or `theta_min` at \
         any point during the run, and the fraction still pinned there at the run's final \
         observation. This is what clause 2 of the admissibility rule below is checked against — \
         a matter of degree, not a single yes/no per bluff rate.\n\n",
    );
    out.push_str("| b | θ_true | n | ever saturated | final saturated |\n|---|---|---|---|---|\n");
    for row in &calibration.saturation_rows {
        for cell in &row.cells {
            out.push_str(&format!(
                "| {:.2} | {:.1} | {} | {:.1}% | {:.1}% |\n",
                row.bluff_rate,
                cell.true_theta,
                cell.n,
                cell.ever_saturated_fraction * 100.0,
                cell.final_saturated_fraction * 100.0,
            ));
        }
    }
    out.push('\n');

    out.push_str("## Admissibility\n\n");
    out.push_str(
        "Architect's ruling on question 6, addition 2: a bluff rate informs the calibrated \
         constant only if **both** hold, checked mechanically rather than argued —\n\n\
         1. Mean signed error is a **non-constant function of the candidate penalty** across the \
         swept grid (the spread of mean signed error across every candidate in the row is above \
         `1e-9`).\n\
         2. The **uncorrected** θ̂ still varies with true ability (the spread of the mean raw θ̂ \
         across the five `THETA_SWEEP` groups is above `1e-9`) — rather than sitting against \
         `theta_max`/`theta_min` regardless of it.\n\n\
         The ±25% band is then checked over exactly the ADMISSIBLE rows, by rule.\n\n",
    );
    out.push_str(
        "| b | clause 1 (varies with penalty) | clause 1 spread | clause 2 (varies with true θ) \
         | clause 2 spread | verdict | disqualifying clause |\n\
         |---|---|---|---|---|---|---|\n",
    );
    for admissibility in &calibration.admissibility {
        let disqualifying = if admissibility.admissible {
            String::from("—")
        } else if !admissibility.clause1_varies_with_penalty {
            format!("clause 1 (spread {:.6})", admissibility.clause1_spread)
        } else {
            format!(
                "clause 2 (spread {:.6})",
                admissibility.clause2_raw_spread_across_true_theta
            )
        };
        out.push_str(&format!(
            "| {:.2} | {} | {:.6} | {} | {:.6} | {} | {} |\n",
            admissibility.bluff_rate,
            admissibility.clause1_varies_with_penalty,
            admissibility.clause1_spread,
            admissibility.clause2_varies_with_true_theta,
            admissibility.clause2_raw_spread_across_true_theta,
            if admissibility.admissible {
                "ADMISSIBLE"
            } else {
                "INADMISSIBLE"
            },
            disqualifying,
        ));
    }
    out.push('\n');

    out.push_str(
        "### The admissible cluster's calibrated values, clamp-hit fraction beside each\n\n",
    );
    out.push_str(
        "A row admissible under both clauses can still carry a non-trivial clamp-hit fraction — \
         printed here rather than folded away, since an admissible-but-partially-saturated row is \
         a measurement with a stated caveat, not a clean one.\n\n",
    );
    out.push_str(
        "| b | calibrated penalty | mean signed error | ever saturated (row) | final saturated \
         (row) |\n|---|---|---|---|---|\n",
    );
    for (row, admissibility) in calibration
        .rows
        .iter()
        .zip(calibration.admissibility.iter())
    {
        if !admissibility.admissible {
            continue;
        }
        let saturation_row = calibration
            .saturation_rows
            .iter()
            .find(|s| s.bluff_rate == row.bluff_rate)
            .expect("every bluff rate has a saturation row");
        let calibrated = row.calibrated();
        out.push_str(&format!(
            "| {:.2} | {:.1} | {:+.4} | {:.1}% | {:.1}% |\n",
            row.bluff_rate,
            calibrated.penalty,
            calibrated.mean_signed_error,
            saturation_row.ever_saturated_fraction * 100.0,
            saturation_row.final_saturated_fraction * 100.0,
        ));
    }
    out.push('\n');

    out.push_str("## The admissible cluster's ±25% band\n\n");
    out.push_str(&format!(
        "Mean calibrated penalty over the ADMISSIBLE rows only: {:.4}, largest deviation {:.1}% \
         of it. {}\n\n",
        calibration.admissible_calibrated_mean,
        calibration.admissible_max_fraction * 100.0,
        if admissible_cluster_fits(calibration) {
            "Inside the ±25% band."
        } else {
            "Outside the ±25% band."
        },
    ));

    let admissible_ever_max = calibration
        .rows
        .iter()
        .zip(calibration.admissibility.iter())
        .filter(|(_, admissibility)| admissibility.admissible)
        .filter_map(|(row, _)| {
            calibration
                .saturation_rows
                .iter()
                .find(|s| s.bluff_rate == row.bluff_rate)
        })
        .map(|s| s.ever_saturated_fraction)
        .fold(0.0_f64, f64::max);

    out.push_str("## Verdict\n\n");
    if !admissible_cluster_fits(calibration) {
        out.push_str(&format!(
            "**No single constant is located by this sweep; the admissible rows' calibrated \
             penalty spreads {:.1}% of its mean, outside the ±25% band, so the admissibility rule \
             does not produce a single fitting constant either.** The incumbent `0.3` reads a mean \
             signed error of {:+.4} at `b = {:.2}` and {:+.4} at `b = {:.2}` — wrong in the same \
             direction at every admissible rate, but not correctable by one number the way this \
             sweep is currently shaped.\n\n",
            calibration.admissible_max_fraction * 100.0,
            calibration.rows[0].incumbent().mean_signed_error,
            calibration.rows[0].bluff_rate,
            calibration.rows[calibration.rows.len() - 1]
                .incumbent()
                .mean_signed_error,
            calibration.rows[calibration.rows.len() - 1].bluff_rate,
        ));
    } else if admissible_ever_max <= NONTRIVIAL_CLAMP_HIT_THRESHOLD {
        out.push_str(&format!(
            "**The admissible cluster survives with low clamp-hit fractions (highest {:.1}%), so \
             the calibrated value is around {:.1} and the incumbent `0.3` is wrong by more than an \
             order of magnitude.**\n\n",
            admissible_ever_max * 100.0,
            calibration.admissible_calibrated_mean,
        ));
    } else {
        out.push_str(&format!(
            "**The clamp is biting inside the admissible cluster (highest ever-saturated fraction \
             {:.1}%), so this sweep cannot locate the constant with this θ grid** — the admissible \
             rows still pass both mechanical clauses (raw θ̂ is not *uniformly* pinned, and mean \
             signed error is not *identically* constant in the penalty), but a non-trivial share of \
             their own runs walk raw θ̂ into the clamp before the correction is ever applied, which \
             means part of what looks like \"the correction's effect\" in those rows is actually \
             the grid's own ceiling. The follow-up is a grid whose top does not collide with \
             `theta_max` — a re-run, not a re-argument.**\n\n",
            admissible_ever_max * 100.0,
        ));
    }

    out.push_str("## Watched red before green\n\n");
    out.push_str(
        "`forcing_the_penalty_to_zero_leaves_the_highest_bluff_cell_strongly_biased_upward` \
         (`src/pseudoword_penalty_calibration.rs`) first asserted the wrong direction — that \
         forcing the candidate penalty to `0.0` at `b = 1.0` would leave the mean signed error \
         *negative* — and failed with `mean signed error at (b=1.0, penalty=0.0): 4.000000, \
         expected < 0.0`: every one of the 150 runs at that cell walked raw θ̂ to `theta_max` \
         exactly, so the mean sits on the clamp. Corrected to assert `> 0.3` and that a higher \
         candidate penalty (`1.0`) reads a lower signed error than `0.0` does — the direction the \
         correction is supposed to move in — and both now pass.\n\n\
         **The admissibility rule itself was watched red too.** \
         `admissibility_flags_b_equals_zero_under_clause_1_and_b_equals_one_under_clause_2` was \
         first run against `admissibility_with_epsilon(b, &cells, &outcomes, 10.0)` in place of \
         the real constant, and failed with `bluff rate 0.10 should be ADMISSIBLE (clause 1 spread \
         0.602479, clause 2 spread 5.669916)` — an epsilon of `10.0` is larger than every genuine \
         row's spread, so it cleared every bluff rate as \"constant,\" including the four rows that \
         are the whole point of the rule. Corrected to call `admissibility` (which reads \
         `DEGENERACY_EPSILON = 1e-9`, comfortably below every genuine spread and comfortably above \
         the floating-point noise the two truly degenerate rows produce), and the test now \
         passes.\n\n",
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

    /// **The admissibility rule, watched red before it was trusted.**
    /// `b = 0.0` must be flagged INADMISSIBLE under clause 1 alone (the
    /// correction term is identically zero, so every candidate penalty
    /// ties); `b = 1.0` must be flagged INADMISSIBLE under clause 2 alone
    /// (raw θ̂ pins at `theta_max` regardless of true θ); the four bluffing
    /// rates between them must stay ADMISSIBLE under both. Using
    /// [`DEGENERACY_EPSILON`] catches this correctly, but the first version
    /// of this check called [`admissibility_with_epsilon`] with `10.0` — an
    /// epsilon larger than the real spreads the four admissible rows produce
    /// — and it failed with `bluff rate 0.10 should be ADMISSIBLE (clause 1
    /// spread 0.602479, clause 2 spread 5.669916)` because both spreads sat
    /// under the oversized threshold, so every row including the four
    /// genuinely informative ones read as "constant." Recorded in
    /// `PSEUDOWORD-PENALTY.md`'s own red-before-green section with this
    /// exact text.
    #[test]
    fn admissibility_flags_b_equals_zero_under_clause_1_and_b_equals_one_under_clause_2() {
        let config = SimConfig::default();
        let tuning = Tuning::default();

        for &b in &BLUFF_RATES {
            let outcomes = outcomes_for(b, &config);
            let cells: Vec<Cell> = CANDIDATE_PENALTIES
                .iter()
                .map(|&penalty| cell_for(b, penalty, &outcomes, &tuning))
                .collect();
            let result = admissibility(b, &cells, &outcomes);

            if b == 0.0 {
                assert!(
                    !result.clause1_varies_with_penalty,
                    "bluff rate {b:.2} should fail clause 1 (spread {:.6})",
                    result.clause1_spread
                );
                assert!(
                    !result.admissible,
                    "bluff rate {b:.2} should be INADMISSIBLE"
                );
            } else if b == 1.0 {
                assert!(
                    !result.clause2_varies_with_true_theta,
                    "bluff rate {b:.2} should fail clause 2 (spread {:.6})",
                    result.clause2_raw_spread_across_true_theta
                );
                assert!(
                    !result.admissible,
                    "bluff rate {b:.2} should be INADMISSIBLE"
                );
            } else {
                assert!(
                    result.admissible,
                    "bluff rate {b:.2} should be ADMISSIBLE (clause 1 spread {:.6}, clause 2 \
                     spread {:.6})",
                    result.clause1_spread, result.clause2_raw_spread_across_true_theta
                );
            }
        }
    }
}
