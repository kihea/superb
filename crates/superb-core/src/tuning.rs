//! Every constant the science calls a tendency rather than a law.
//!
//! `docs/engine-contract.md` §3 draws the line: a law lives in code, a
//! tendency lives here, in `tuning.toml`, named honestly even though the
//! product's interface never speaks any of them. This module is the typed
//! accessor and the range check — the shape ADR-015 committed to, not the
//! values, which stay provisional until the simulator has run.
//!
//! The shipped file is read once, at compile time, via [`include_str!`]. The
//! crate stays pure (engine-contract §1): no clock, no RNG, and — the law
//! this module could easily have broken — no file opened at run time. Only
//! the simulator, a host outside this crate, may hand `Tuning` a different
//! string.

use core::fmt;

use serde::{Deserialize, Serialize};

/// The shipped tuning file's contents, folded into the binary at compile
/// time. This is the only place `tuning.toml` is read; every other consumer
/// goes through [`Tuning::default`] or [`Tuning::from_toml_str`].
const SHIPPED_TUNING_TOML: &str = include_str!("../tuning.toml");

/// Every tunable constant the composer and scheduler read (engine-contract
/// §3), typed and range-checked. Fields are named identically to the keys in
/// `tuning.toml`.
///
/// The only ways to obtain one are [`Tuning::default`], which cannot fail
/// because it is checked by
/// [`shipped_tuning_toml_parses_and_validates`](tests), and
/// [`Tuning::from_toml_str`], which validates on construction.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Tuning {
    /// Varied-context encounters the schedule aims a word toward before it
    /// is treated as understood without deliberate retrieval.
    pub(crate) encounter_target: u32,
    /// The fewest encounters that can still count as demonstrated mastery.
    pub(crate) encounter_target_min: u32,
    /// The most encounters a word is scheduled for before repetition alone
    /// stops adding value.
    pub(crate) encounter_target_max: u32,
    /// How fast a passage's later due words lose value in the coverage
    /// score: the i-th most valuable word is worth `coverage_decay^(i-1)`
    /// of the first (ADR-015).
    pub(crate) coverage_decay: f64,
    /// Multiplies a sourced excerpt's score against a composed passage's
    /// (ADR-015).
    pub(crate) sourced_preference: f64,
    /// The fewest due words a sourced excerpt must cover in informative
    /// context before it is a candidate at all (ADR-015's coverage floor).
    pub(crate) min_sourced_coverage: u32,
    /// How far below the learner's estimated ability a word may sit and
    /// still be worth serving (engine-contract §4).
    pub(crate) band_low: f64,
    /// How far above the learner's estimated ability a word may sit and
    /// still be worth serving (engine-contract §4).
    pub(crate) band_high: f64,
    /// How far the online ability estimate steps toward a single
    /// encounter's residual, as a fraction of it (engine-contract §4).
    pub(crate) theta_update_rate: f64,
    /// The lower bound θ is clamped to (BRIEF-010; engine-contract §5 — "θ
    /// stays bounded"). Symmetric with `theta_max` by convention, not by
    /// requirement: validation only refuses the pair if they are inverted.
    pub(crate) theta_min: f64,
    /// The upper bound θ is clamped to. See `theta_min`.
    pub(crate) theta_max: f64,
    /// How far a single pseudoword over-claim steps θ down (BRIEF-010's
    /// pseudoword correction — `src/ability.rs`'s `update_theta`). Strictly
    /// positive: this constant exists to buy a downward correction, and a
    /// non-positive value would buy nothing or the wrong sign.
    pub(crate) pseudoword_penalty: f64,
    /// How many due words waiting before the composer stops choosing for
    /// taste and starts choosing for coverage (ADR-015's backlog guard).
    pub(crate) backlog_override_due: u32,
    /// How many days a word may sit due before waiting for a better
    /// passage stops paying for itself (ADR-015's backlog guard).
    pub(crate) backlog_override_age_days: u32,
    /// Standard deviations from a word's own dwell distribution before a
    /// slow read counts as evidence rather than noise (engine-contract §3).
    pub(crate) dwell_anomaly_z: f64,
    /// The most probes the schedule will spend in one session before
    /// reading starts to feel like testing (engine-contract §3).
    pub(crate) probe_frequency_cap: u32,
    /// How strongly a correctly assembled probe counts as evidence the
    /// reader knows the word (BRIEF-011; engine-contract §3 — `ProbeResult`
    /// is the strongest positive signal). Strictly greater than
    /// `signal_strength_negative_strong`.
    pub(crate) signal_strength_probe_positive: f64,
    /// How strongly a gloss tap, or a failed probe, counts as evidence the
    /// word is not yet automatic (BRIEF-011; engine-contract §3 —
    /// `GlossTap` is the strongest negative signal, and
    /// `crate::scheduler::EncounterOutcome`'s own doc comment treats a
    /// failed probe identically). Strictly between
    /// `signal_strength_dwell_negative` and `signal_strength_probe_positive`.
    pub(crate) signal_strength_negative_strong: f64,
    /// How strongly a slow read counts as evidence, on a screen where it
    /// can be pinned to exactly one target word (BRIEF-011; engine-contract
    /// §3 — `ScreenDwell` is a weak negative signal). Strictly positive and
    /// strictly the smallest of the three signal strengths.
    pub(crate) signal_strength_dwell_negative: f64,
    /// The first interval, in days, after a word leaves Unseen.
    pub(crate) interval_initial_days: f64,
    /// Multiplier on a clean pass while a word is in Learning.
    pub(crate) interval_learning: f64,
    /// Multiplier on a clean pass while a word is Consolidating.
    pub(crate) interval_consolidating: f64,
    /// Multiplier on a clean pass while a word is Automatic.
    pub(crate) interval_automatic: f64,
    /// Multiplier applied on a lapse — never a reset to the initial
    /// interval.
    pub(crate) interval_lapse: f64,
    /// The longest interval the schedule will ever set.
    pub(crate) interval_max_days: f64,
    /// How much a word in each state is worth, met in each pool (ADR-015).
    pub(crate) affinity: Affinity,
}

/// The state-by-pool affinity table (ADR-015, ADR-009's judgment made
/// numeric). Named for the four states a word can be scored in; `Unseen`
/// carries none, because an unseen word is not yet a candidate for either
/// pool.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Affinity {
    pub(crate) seeded: PoolAffinity,
    pub(crate) learning: PoolAffinity,
    pub(crate) consolidating: PoolAffinity,
    pub(crate) automatic: PoolAffinity,
}

impl Affinity {
    /// Every affinity value paired with the dotted key that names it in
    /// `tuning.toml`, in file order. Used by validation to report exactly
    /// which entry is out of range, and by tests to construct one bad entry
    /// at a time.
    fn entries(&self) -> [(&'static str, f64); 8] {
        [
            ("affinity.seeded.composed", self.seeded.composed),
            ("affinity.seeded.sourced", self.seeded.sourced),
            ("affinity.learning.composed", self.learning.composed),
            ("affinity.learning.sourced", self.learning.sourced),
            (
                "affinity.consolidating.composed",
                self.consolidating.composed,
            ),
            ("affinity.consolidating.sourced", self.consolidating.sourced),
            ("affinity.automatic.composed", self.automatic.composed),
            ("affinity.automatic.sourced", self.automatic.sourced),
        ]
    }
}

/// One pool's affinity for one word state: how much a word met in this pool,
/// at this state, is worth to the composer's score (ADR-015).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PoolAffinity {
    pub(crate) composed: f64,
    pub(crate) sourced: f64,
}

impl Default for Tuning {
    /// The shipped tuning, parsed from `tuning.toml` at compile time via
    /// [`include_str!`] — never a runtime file read. Panics only if the
    /// shipped file itself is malformed or out of range, which
    /// `shipped_tuning_toml_parses_and_validates` below exists to catch
    /// before this ever runs against real input.
    fn default() -> Self {
        Self::from_toml_str(SHIPPED_TUNING_TOML)
            .expect("the shipped tuning.toml parses and validates")
    }
}

impl Tuning {
    /// The lower bound θ is clamped to. Read by property tests outside this
    /// crate (`tests/ability_properties.rs`) as the oracle for "θ never
    /// leaves its clamp range" — the bound must come from here rather than
    /// be restated as a literal, or a future edit to `tuning.toml` could
    /// make the test quietly check the wrong range.
    pub fn theta_min(&self) -> f64 {
        self.theta_min
    }

    /// The upper bound θ is clamped to. See [`Tuning::theta_min`].
    pub fn theta_max(&self) -> f64 {
        self.theta_max
    }

    /// How far below the learner's estimated ability a word may sit and
    /// still be worth serving. Read by property tests outside this crate
    /// (`tests/ability_properties.rs`) to confirm `band`'s width against the
    /// same source `crate::ability::band` itself reads.
    pub fn band_low(&self) -> f64 {
        self.band_low
    }

    /// How far above the learner's estimated ability a word may sit and
    /// still be worth serving. See [`Tuning::band_low`].
    pub fn band_high(&self) -> f64 {
        self.band_high
    }

    /// The first interval, in days, after a word leaves Unseen. Read by
    /// property tests outside this crate (`tests/scheduler_properties.rs`)
    /// as the floor a lapsed interval can fall to, and as one end of the
    /// valid-interval sampling range those tests generate against.
    pub fn interval_initial_days(&self) -> f64 {
        self.interval_initial_days
    }

    /// The longest interval the schedule will ever set. Read by property
    /// tests outside this crate (`tests/scheduler_properties.rs`) as the
    /// ceiling `schedule_encounter`'s own output is checked against.
    pub fn interval_max_days(&self) -> f64 {
        self.interval_max_days
    }

    /// Every signal strength paired with the key that names it in
    /// `tuning.toml`, in file order. Used by validation to report exactly
    /// which entry is out of range, and by tests to construct one bad entry
    /// at a time.
    fn signal_strength_entries(&self) -> [(&'static str, f64); 3] {
        [
            (
                "signal_strength_probe_positive",
                self.signal_strength_probe_positive,
            ),
            (
                "signal_strength_negative_strong",
                self.signal_strength_negative_strong,
            ),
            (
                "signal_strength_dwell_negative",
                self.signal_strength_dwell_negative,
            ),
        ]
    }

    /// Every interval multiplier paired with the key that names it in
    /// `tuning.toml`, in file order. Used by validation to report exactly
    /// which entry is out of range, and by tests to construct one bad entry
    /// at a time.
    fn interval_entries(&self) -> [(&'static str, f64); 6] {
        [
            ("interval_initial_days", self.interval_initial_days),
            ("interval_learning", self.interval_learning),
            ("interval_consolidating", self.interval_consolidating),
            ("interval_automatic", self.interval_automatic),
            ("interval_lapse", self.interval_lapse),
            ("interval_max_days", self.interval_max_days),
        ]
    }

    /// Parse and range-check a TOML document as a [`Tuning`]. This is the
    /// only entry point that can produce an invalid-shaped or out-of-range
    /// `Tuning` a `TuningError` instead of one — construction and validation
    /// are the same step, so there is no way to hold a `Tuning` that has not
    /// been checked.
    pub fn from_toml_str(input: &str) -> Result<Self, TuningError> {
        let tuning: Tuning =
            toml::from_str(input).map_err(|error| TuningError::Parse(error.to_string()))?;
        tuning.validate()?;
        Ok(tuning)
    }

    fn validate(&self) -> Result<(), TuningError> {
        if self.encounter_target_min > self.encounter_target_max {
            return Err(TuningError::EncounterTargetRangeInverted {
                min: self.encounter_target_min,
                max: self.encounter_target_max,
            });
        }

        if self.encounter_target < self.encounter_target_min
            || self.encounter_target > self.encounter_target_max
        {
            return Err(TuningError::EncounterTargetOutOfRange {
                target: self.encounter_target,
                min: self.encounter_target_min,
                max: self.encounter_target_max,
            });
        }

        // Named booleans rather than `!(a > b)` directly: strict range checks
        // on `f64` must still refuse NaN, and a bare negated comparison reads
        // as though it does when it silently would not (clippy::neg_cmp_op_on_partial_ord).
        let coverage_decay_in_range = self.coverage_decay > 0.0 && self.coverage_decay < 1.0;
        if !coverage_decay_in_range {
            return Err(TuningError::CoverageDecayOutOfRange {
                value: self.coverage_decay,
            });
        }

        let sourced_preference_is_positive = self.sourced_preference > 0.0;
        if !sourced_preference_is_positive {
            return Err(TuningError::SourcedPreferenceNotPositive {
                value: self.sourced_preference,
            });
        }

        for (field, value) in self.affinity.entries() {
            let is_positive = value > 0.0;
            if !is_positive {
                return Err(TuningError::AffinityNotPositive {
                    field: field.to_string(),
                    value,
                });
            }
        }

        if self.min_sourced_coverage < 1 {
            return Err(TuningError::MinSourcedCoverageTooLow {
                value: self.min_sourced_coverage,
            });
        }

        // engine-contract §4 defines the θ band as [θ − band_low, θ + band_high]:
        // band_low is subtracted, band_high is added. If band_low is not
        // strictly less than band_high, the band the scheduler will one day
        // read is inverted or empty before any word is ever scored against it.
        if self.band_low >= self.band_high {
            return Err(TuningError::BandInverted {
                low: self.band_low,
                high: self.band_high,
            });
        }

        for (field, value) in self.interval_entries() {
            let is_positive = value > 0.0;
            if !is_positive {
                return Err(TuningError::IntervalNotPositive {
                    field: field.to_string(),
                    value,
                });
            }
        }

        let interval_lapse_in_range = self.interval_lapse > 0.0 && self.interval_lapse < 1.0;
        if !interval_lapse_in_range {
            return Err(TuningError::IntervalLapseOutOfRange {
                value: self.interval_lapse,
            });
        }

        if self.interval_max_days <= self.interval_initial_days {
            return Err(TuningError::IntervalMaxNotGreaterThanInitial {
                max: self.interval_max_days,
                initial: self.interval_initial_days,
            });
        }

        // Expansion widens as confidence grows: the state machine already
        // knows how well a word is known, so a configuration that expands
        // faster in Learning than in Automatic is not a tuning choice, it is
        // a mistake — the multipliers must climb Learning -> Consolidating ->
        // Automatic, never fall.
        if self.interval_learning > self.interval_consolidating
            || self.interval_consolidating > self.interval_automatic
        {
            return Err(TuningError::IntervalExpansionNotMonotonic {
                learning: self.interval_learning,
                consolidating: self.interval_consolidating,
                automatic: self.interval_automatic,
            });
        }

        let theta_update_rate_in_range =
            self.theta_update_rate > 0.0 && self.theta_update_rate < 1.0;
        if !theta_update_rate_in_range {
            return Err(TuningError::ThetaUpdateRateOutOfRange {
                value: self.theta_update_rate,
            });
        }

        // Same shape as the band check just above: `update_theta` clamps
        // with `theta.max(theta_min).min(theta_max)`, which silently
        // produces `theta_min` for any input if the range is inverted or
        // collapsed, rather than failing loudly at the one call site that
        // could still refuse it.
        if self.theta_min >= self.theta_max {
            return Err(TuningError::ThetaRangeInverted {
                min: self.theta_min,
                max: self.theta_max,
            });
        }

        let pseudoword_penalty_is_positive = self.pseudoword_penalty > 0.0;
        if !pseudoword_penalty_is_positive {
            return Err(TuningError::PseudowordPenaltyNotPositive {
                value: self.pseudoword_penalty,
            });
        }

        let dwell_anomaly_z_is_positive = self.dwell_anomaly_z > 0.0;
        if !dwell_anomaly_z_is_positive {
            return Err(TuningError::DwellAnomalyZNotPositive {
                value: self.dwell_anomaly_z,
            });
        }

        if self.probe_frequency_cap < 1 {
            return Err(TuningError::ProbeFrequencyCapTooLow {
                value: self.probe_frequency_cap,
            });
        }

        for (field, value) in self.signal_strength_entries() {
            let is_positive = value > 0.0;
            if !is_positive {
                return Err(TuningError::SignalStrengthNotPositive {
                    field: field.to_string(),
                    value,
                });
            }
        }

        // BRIEF-011's whole guarantee: `ProbeResult` outranks `GlossTap`
        // outranks `ScreenDwell`, structurally (engine-contract §1 law 6) —
        // no legal edit to this file can invert the ordering
        // `crate::signals::rank` reads these three constants to produce.
        if !(self.signal_strength_probe_positive > self.signal_strength_negative_strong
            && self.signal_strength_negative_strong > self.signal_strength_dwell_negative)
        {
            return Err(TuningError::SignalStrengthNotStrictlyOrdered {
                probe_positive: self.signal_strength_probe_positive,
                negative_strong: self.signal_strength_negative_strong,
                dwell_negative: self.signal_strength_dwell_negative,
            });
        }

        if self.backlog_override_due < 1 {
            return Err(TuningError::BacklogOverrideDueTooLow {
                value: self.backlog_override_due,
            });
        }

        if self.backlog_override_age_days < 1 {
            return Err(TuningError::BacklogOverrideAgeDaysTooLow {
                value: self.backlog_override_age_days,
            });
        }

        Ok(())
    }
}

/// Why a candidate `Tuning` was refused, either at parse or at range-check.
///
/// One variant per check `Tuning::validate` performs, so a failing test can
/// assert on the exact reason rather than on "it errored."
#[derive(Debug, Clone, PartialEq)]
pub enum TuningError {
    /// The input was not a valid `Tuning` document at all — malformed TOML,
    /// a missing key, or a value of the wrong type.
    Parse(String),
    /// `encounter_target` fell outside `[encounter_target_min,
    /// encounter_target_max]`.
    EncounterTargetOutOfRange { target: u32, min: u32, max: u32 },
    /// `encounter_target_min` was greater than `encounter_target_max`,
    /// inverting the range `encounter_target` is checked against.
    EncounterTargetRangeInverted { min: u32, max: u32 },
    /// `coverage_decay` was not strictly between 0 and 1.
    CoverageDecayOutOfRange { value: f64 },
    /// `sourced_preference` was not strictly positive.
    SourcedPreferenceNotPositive { value: f64 },
    /// An affinity table entry, named by its dotted key, was not strictly
    /// positive.
    AffinityNotPositive { field: String, value: f64 },
    /// `min_sourced_coverage` was below 1.
    MinSourcedCoverageTooLow { value: u32 },
    /// `band_low` was not strictly less than `band_high`, inverting or
    /// collapsing the θ band engine-contract §4 defines.
    BandInverted { low: f64, high: f64 },
    /// An interval multiplier, named by its key, was not strictly positive.
    IntervalNotPositive { field: String, value: f64 },
    /// `interval_lapse` was not strictly between 0 and 1.
    IntervalLapseOutOfRange { value: f64 },
    /// `interval_max_days` was not strictly greater than
    /// `interval_initial_days`.
    IntervalMaxNotGreaterThanInitial { max: f64, initial: f64 },
    /// The interval multipliers did not widen with confidence:
    /// `interval_learning`, `interval_consolidating`, and
    /// `interval_automatic` must climb, never fall.
    IntervalExpansionNotMonotonic {
        learning: f64,
        consolidating: f64,
        automatic: f64,
    },
    /// `theta_update_rate` was not strictly between 0 and 1.
    ThetaUpdateRateOutOfRange { value: f64 },
    /// `theta_min` was not strictly less than `theta_max`, inverting or
    /// collapsing the clamp range `update_theta` enforces.
    ThetaRangeInverted { min: f64, max: f64 },
    /// `pseudoword_penalty` was not strictly positive.
    PseudowordPenaltyNotPositive { value: f64 },
    /// `dwell_anomaly_z` was not strictly positive.
    DwellAnomalyZNotPositive { value: f64 },
    /// `probe_frequency_cap` was below 1.
    ProbeFrequencyCapTooLow { value: u32 },
    /// A signal strength, named by its dotted key, was not strictly
    /// positive.
    SignalStrengthNotPositive { field: String, value: f64 },
    /// `signal_strength_probe_positive`, `signal_strength_negative_strong`,
    /// and `signal_strength_dwell_negative` did not strictly descend in
    /// that order.
    SignalStrengthNotStrictlyOrdered {
        probe_positive: f64,
        negative_strong: f64,
        dwell_negative: f64,
    },
    /// `backlog_override_due` was below 1.
    BacklogOverrideDueTooLow { value: u32 },
    /// `backlog_override_age_days` was below 1.
    BacklogOverrideAgeDaysTooLow { value: u32 },
}

impl fmt::Display for TuningError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TuningError::Parse(message) => write!(f, "tuning.toml does not parse: {message}"),
            TuningError::EncounterTargetOutOfRange { target, min, max } => {
                write!(f, "encounter_target {target} is outside [{min}, {max}]")
            }
            TuningError::EncounterTargetRangeInverted { min, max } => {
                write!(
                    f,
                    "encounter_target_min {min} is greater than encounter_target_max {max}"
                )
            }
            TuningError::CoverageDecayOutOfRange { value } => {
                write!(f, "coverage_decay {value} is not strictly between 0 and 1")
            }
            TuningError::SourcedPreferenceNotPositive { value } => {
                write!(f, "sourced_preference {value} is not strictly positive")
            }
            TuningError::AffinityNotPositive { field, value } => {
                write!(f, "{field} is {value}, which is not strictly positive")
            }
            TuningError::MinSourcedCoverageTooLow { value } => {
                write!(f, "min_sourced_coverage {value} is below 1")
            }
            TuningError::BandInverted { low, high } => {
                write!(
                    f,
                    "band_low {low} is not strictly less than band_high {high}"
                )
            }
            TuningError::IntervalNotPositive { field, value } => {
                write!(f, "{field} is {value}, which is not strictly positive")
            }
            TuningError::IntervalLapseOutOfRange { value } => {
                write!(f, "interval_lapse {value} is not strictly between 0 and 1")
            }
            TuningError::IntervalMaxNotGreaterThanInitial { max, initial } => {
                write!(
                    f,
                    "interval_max_days {max} is not strictly greater than interval_initial_days {initial}"
                )
            }
            TuningError::IntervalExpansionNotMonotonic {
                learning,
                consolidating,
                automatic,
            } => {
                write!(
                    f,
                    "interval multipliers do not widen with confidence: interval_learning {learning}, interval_consolidating {consolidating}, interval_automatic {automatic}"
                )
            }
            TuningError::ThetaUpdateRateOutOfRange { value } => {
                write!(
                    f,
                    "theta_update_rate {value} is not strictly between 0 and 1"
                )
            }
            TuningError::ThetaRangeInverted { min, max } => {
                write!(
                    f,
                    "theta_min {min} is not strictly less than theta_max {max}"
                )
            }
            TuningError::PseudowordPenaltyNotPositive { value } => {
                write!(f, "pseudoword_penalty {value} is not strictly positive")
            }
            TuningError::DwellAnomalyZNotPositive { value } => {
                write!(f, "dwell_anomaly_z {value} is not strictly positive")
            }
            TuningError::ProbeFrequencyCapTooLow { value } => {
                write!(f, "probe_frequency_cap {value} is below 1")
            }
            TuningError::SignalStrengthNotPositive { field, value } => {
                write!(f, "{field} is {value}, which is not strictly positive")
            }
            TuningError::SignalStrengthNotStrictlyOrdered {
                probe_positive,
                negative_strong,
                dwell_negative,
            } => {
                write!(
                    f,
                    "signal strengths do not strictly descend: signal_strength_probe_positive \
                     {probe_positive}, signal_strength_negative_strong {negative_strong}, \
                     signal_strength_dwell_negative {dwell_negative}"
                )
            }
            TuningError::BacklogOverrideDueTooLow { value } => {
                write!(f, "backlog_override_due {value} is below 1")
            }
            TuningError::BacklogOverrideAgeDaysTooLow { value } => {
                write!(f, "backlog_override_age_days {value} is below 1")
            }
        }
    }
}

impl core::error::Error for TuningError {}

#[cfg(test)]
mod tests {
    use super::*;

    /// A `Tuning` document with every field on the good side of its own
    /// check, so each bad-input test below can change exactly one line.
    const VALID: &str = r#"
        encounter_target = 10
        encounter_target_min = 6
        encounter_target_max = 20
        coverage_decay = 0.75
        sourced_preference = 2.4
        min_sourced_coverage = 2
        band_low = -0.2
        band_high = 0.6
        theta_update_rate = 0.15
        theta_min = -4.0
        theta_max = 4.0
        pseudoword_penalty = 0.3
        backlog_override_due = 40
        backlog_override_age_days = 7
        dwell_anomaly_z = 2.0
        probe_frequency_cap = 3
        signal_strength_probe_positive = 3.0
        signal_strength_negative_strong = 2.0
        signal_strength_dwell_negative = 0.5
        interval_initial_days = 1.0
        interval_learning = 2.0
        interval_consolidating = 2.5
        interval_automatic = 3.0
        interval_lapse = 0.4
        interval_max_days = 180.0

        [affinity.seeded]
        composed = 1.0
        sourced = 0.5

        [affinity.learning]
        composed = 1.0
        sourced = 0.7

        [affinity.consolidating]
        composed = 0.8
        sourced = 1.3

        [affinity.automatic]
        composed = 0.5
        sourced = 1.5
    "#;

    #[test]
    fn shipped_tuning_toml_parses_and_validates() {
        // A bad edit to the shipped file fails the build here, not the app.
        Tuning::from_toml_str(SHIPPED_TUNING_TOML)
            .expect("the shipped tuning.toml parses and validates");
    }

    #[test]
    fn default_round_trips_through_toml_unchanged() {
        // Stops a future field being added to the struct and forgotten in
        // the shipped file: a field the struct carries but the round trip
        // does not restate would be silently dropped here.
        let original = Tuning::default();
        let reserialized = toml::to_string(&original).expect("Tuning serializes to TOML");
        let reparsed =
            Tuning::from_toml_str(&reserialized).expect("the reserialized document validates");
        assert_eq!(original, reparsed);
    }

    #[test]
    fn encounter_target_out_of_range_is_rejected() {
        let bad = VALID.replace("encounter_target = 10", "encounter_target = 3");
        assert_eq!(
            Tuning::from_toml_str(&bad),
            Err(TuningError::EncounterTargetOutOfRange {
                target: 3,
                min: 6,
                max: 20,
            })
        );
    }

    #[test]
    fn malformed_toml_is_rejected_as_parse_error() {
        let bad = "this is not valid toml = = =";
        match Tuning::from_toml_str(bad) {
            Err(TuningError::Parse(_)) => {}
            other => panic!("expected TuningError::Parse, got {other:?}"),
        }
    }

    #[test]
    fn encounter_target_range_inverted_is_rejected() {
        let bad = VALID
            .replace("encounter_target_min = 6", "encounter_target_min = 20")
            .replace("encounter_target_max = 20", "encounter_target_max = 6");
        assert_eq!(
            Tuning::from_toml_str(&bad),
            Err(TuningError::EncounterTargetRangeInverted { min: 20, max: 6 })
        );
    }

    #[test]
    fn coverage_decay_out_of_range_is_rejected() {
        let bad = VALID.replace("coverage_decay = 0.75", "coverage_decay = 1.0");
        assert_eq!(
            Tuning::from_toml_str(&bad),
            Err(TuningError::CoverageDecayOutOfRange { value: 1.0 })
        );
    }

    #[test]
    fn sourced_preference_not_positive_is_rejected() {
        let bad = VALID.replace("sourced_preference = 2.4", "sourced_preference = 0.0");
        assert_eq!(
            Tuning::from_toml_str(&bad),
            Err(TuningError::SourcedPreferenceNotPositive { value: 0.0 })
        );
    }

    #[test]
    fn negative_affinity_is_rejected() {
        let bad = VALID.replace(
            "[affinity.consolidating]\n        composed = 0.8",
            "[affinity.consolidating]\n        composed = -0.1",
        );
        assert_eq!(
            Tuning::from_toml_str(&bad),
            Err(TuningError::AffinityNotPositive {
                field: "affinity.consolidating.composed".to_string(),
                value: -0.1,
            })
        );
    }

    #[test]
    fn min_sourced_coverage_too_low_is_rejected() {
        let bad = VALID.replace("min_sourced_coverage = 2", "min_sourced_coverage = 0");
        assert_eq!(
            Tuning::from_toml_str(&bad),
            Err(TuningError::MinSourcedCoverageTooLow { value: 0 })
        );
    }

    #[test]
    fn band_inverted_is_rejected() {
        let bad = VALID
            .replace("band_low = -0.2", "band_low = 5.0")
            .replace("band_high = 0.6", "band_high = -5.0");
        assert_eq!(
            Tuning::from_toml_str(&bad),
            Err(TuningError::BandInverted {
                low: 5.0,
                high: -5.0,
            })
        );
    }

    #[test]
    fn interval_not_positive_is_rejected() {
        let bad = VALID.replace("interval_learning = 2.0", "interval_learning = 0.0");
        assert_eq!(
            Tuning::from_toml_str(&bad),
            Err(TuningError::IntervalNotPositive {
                field: "interval_learning".to_string(),
                value: 0.0,
            })
        );
    }

    #[test]
    fn interval_lapse_out_of_range_is_rejected() {
        let bad = VALID.replace("interval_lapse = 0.4", "interval_lapse = 1.2");
        assert_eq!(
            Tuning::from_toml_str(&bad),
            Err(TuningError::IntervalLapseOutOfRange { value: 1.2 })
        );
    }

    #[test]
    fn interval_max_not_greater_than_initial_is_rejected() {
        let bad = VALID.replace("interval_max_days = 180.0", "interval_max_days = 1.0");
        assert_eq!(
            Tuning::from_toml_str(&bad),
            Err(TuningError::IntervalMaxNotGreaterThanInitial {
                max: 1.0,
                initial: 1.0,
            })
        );
    }

    #[test]
    fn interval_expansion_not_monotonic_is_rejected() {
        let bad = VALID
            .replace("interval_learning = 2.0", "interval_learning = 5.0")
            .replace("interval_automatic = 3.0", "interval_automatic = 0.1");
        assert_eq!(
            Tuning::from_toml_str(&bad),
            Err(TuningError::IntervalExpansionNotMonotonic {
                learning: 5.0,
                consolidating: 2.5,
                automatic: 0.1,
            })
        );
    }

    #[test]
    fn theta_update_rate_out_of_range_is_rejected() {
        let bad = VALID.replace("theta_update_rate = 0.15", "theta_update_rate = 1.0");
        assert_eq!(
            Tuning::from_toml_str(&bad),
            Err(TuningError::ThetaUpdateRateOutOfRange { value: 1.0 })
        );
    }

    #[test]
    fn theta_range_inverted_is_rejected() {
        let bad = VALID
            .replace("theta_min = -4.0", "theta_min = 4.0")
            .replace("theta_max = 4.0", "theta_max = -4.0");
        assert_eq!(
            Tuning::from_toml_str(&bad),
            Err(TuningError::ThetaRangeInverted {
                min: 4.0,
                max: -4.0,
            })
        );
    }

    #[test]
    fn pseudoword_penalty_not_positive_is_rejected() {
        let bad = VALID.replace("pseudoword_penalty = 0.3", "pseudoword_penalty = 0.0");
        assert_eq!(
            Tuning::from_toml_str(&bad),
            Err(TuningError::PseudowordPenaltyNotPositive { value: 0.0 })
        );
    }

    #[test]
    fn dwell_anomaly_z_not_positive_is_rejected() {
        let bad = VALID.replace("dwell_anomaly_z = 2.0", "dwell_anomaly_z = 0.0");
        assert_eq!(
            Tuning::from_toml_str(&bad),
            Err(TuningError::DwellAnomalyZNotPositive { value: 0.0 })
        );
    }

    #[test]
    fn probe_frequency_cap_too_low_is_rejected() {
        let bad = VALID.replace("probe_frequency_cap = 3", "probe_frequency_cap = 0");
        assert_eq!(
            Tuning::from_toml_str(&bad),
            Err(TuningError::ProbeFrequencyCapTooLow { value: 0 })
        );
    }

    #[test]
    fn signal_strength_probe_positive_not_positive_is_rejected() {
        let bad = VALID.replace(
            "signal_strength_probe_positive = 3.0",
            "signal_strength_probe_positive = 0.0",
        );
        assert_eq!(
            Tuning::from_toml_str(&bad),
            Err(TuningError::SignalStrengthNotPositive {
                field: "signal_strength_probe_positive".to_string(),
                value: 0.0,
            })
        );
    }

    #[test]
    fn signal_strength_negative_strong_not_positive_is_rejected() {
        let bad = VALID.replace(
            "signal_strength_negative_strong = 2.0",
            "signal_strength_negative_strong = -1.0",
        );
        assert_eq!(
            Tuning::from_toml_str(&bad),
            Err(TuningError::SignalStrengthNotPositive {
                field: "signal_strength_negative_strong".to_string(),
                value: -1.0,
            })
        );
    }

    #[test]
    fn signal_strength_dwell_negative_not_positive_is_rejected() {
        let bad = VALID.replace(
            "signal_strength_dwell_negative = 0.5",
            "signal_strength_dwell_negative = 0.0",
        );
        assert_eq!(
            Tuning::from_toml_str(&bad),
            Err(TuningError::SignalStrengthNotPositive {
                field: "signal_strength_dwell_negative".to_string(),
                value: 0.0,
            })
        );
    }

    /// The ordering check, defeated the direct way: a `dwell_negative` that
    /// meets or exceeds `negative_strong` — a legal-looking file that would
    /// silently invert `ScreenDwell` past `GlossTap` if this check did not
    /// exist.
    #[test]
    fn signal_strength_not_strictly_ordered_is_rejected_when_dwell_meets_negative_strong() {
        let bad = VALID.replace(
            "signal_strength_dwell_negative = 0.5",
            "signal_strength_dwell_negative = 2.0",
        );
        assert_eq!(
            Tuning::from_toml_str(&bad),
            Err(TuningError::SignalStrengthNotStrictlyOrdered {
                probe_positive: 3.0,
                negative_strong: 2.0,
                dwell_negative: 2.0,
            })
        );
    }

    /// The same check, defeated from the other end: a `probe_positive` that
    /// falls to or below `negative_strong`.
    #[test]
    fn signal_strength_not_strictly_ordered_is_rejected_when_probe_meets_negative_strong() {
        let bad = VALID.replace(
            "signal_strength_probe_positive = 3.0",
            "signal_strength_probe_positive = 2.0",
        );
        assert_eq!(
            Tuning::from_toml_str(&bad),
            Err(TuningError::SignalStrengthNotStrictlyOrdered {
                probe_positive: 2.0,
                negative_strong: 2.0,
                dwell_negative: 0.5,
            })
        );
    }

    #[test]
    fn backlog_override_due_too_low_is_rejected() {
        let bad = VALID.replace("backlog_override_due = 40", "backlog_override_due = 0");
        assert_eq!(
            Tuning::from_toml_str(&bad),
            Err(TuningError::BacklogOverrideDueTooLow { value: 0 })
        );
    }

    #[test]
    fn backlog_override_age_days_too_low_is_rejected() {
        let bad = VALID.replace(
            "backlog_override_age_days = 7",
            "backlog_override_age_days = 0",
        );
        assert_eq!(
            Tuning::from_toml_str(&bad),
            Err(TuningError::BacklogOverrideAgeDaysTooLow { value: 0 })
        );
    }
}
