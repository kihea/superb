//! The session battery M2 DONE item 3 (ADVISORY-007 §1, and its addendum
//! A3(c)) asks for: the simulator run against the live indexed corpus,
//! reporting the four-class encounter breakdown, the session-shape gate
//! ("the majority of word encounters... occur inside passages rather than
//! in the deck"), and a deliberately degraded configuration proving the
//! gate can read red.
//!
//! **What this module adds over `simulation::run_real`.** One real-corpus
//! run is a single seed's own noise. This module aggregates the same run
//! across several seeds at two named configurations — the shipped
//! [`SimConfig`] and [`deck_heavy_config`] — and answers the two corpus-side
//! questions issue
//! #36's trial needs waiting (directive 3's band coverage, directive 4's
//! reachable ceiling). Nothing here decides anything the composer does not
//! already decide; it only counts and aggregates what `run_real` already
//! produced.

use superb_core::Tuning;

use crate::calibration::tuning_with_sourced_preference;
use crate::corpus::RealCorpus;
use crate::simulation::{self, DueListCoverageTally, EncounterTally, SimConfig};

/// One battery configuration's result, aggregated across every seed it ran.
#[derive(Debug, Clone, Copy, Default)]
pub struct BatteryResult {
    pub encounters: EncounterTally,
    pub due_list_coverage: DueListCoverageTally,
    pub seeds_run: usize,
}

impl BatteryResult {
    /// M2 DONE item 3's gate, read off this configuration's aggregated
    /// encounter tally.
    pub fn gate_passes(&self) -> bool {
        self.encounters.passages_are_the_majority()
    }
}

/// Run one configuration against the real corpus, across `seeds`, and
/// aggregate every seed's encounter tally and due-list coverage into one
/// result. `true_theta` is fixed at `0.0` — the same convention
/// `report.rs`'s Assertion 3/5 use for their own canonical runs: the
/// battery is about session *shape*, not about where any one learner's
/// ability sits, so every seed represents an equally plausible reader.
pub fn run_battery(
    seeds: &[u64],
    config: &SimConfig,
    tuning: &Tuning,
    corpus: &RealCorpus,
) -> BatteryResult {
    let mut result = BatteryResult {
        seeds_run: seeds.len(),
        ..BatteryResult::default()
    };
    for &seed in seeds {
        let outcome = simulation::run_real(seed, 0.0, config, tuning, corpus);
        result.encounters.deck += outcome.encounters.deck;
        result.encounters.composed_for_gap += outcome.encounters.composed_for_gap;
        result.encounters.composed_for_support += outcome.encounters.composed_for_support;
        result.encounters.sourced += outcome.encounters.sourced;
        result.due_list_coverage.sessions += outcome.due_list_coverage.sessions;
        result.due_list_coverage.at_least_1 += outcome.due_list_coverage.at_least_1;
        result.due_list_coverage.at_least_2 += outcome.due_list_coverage.at_least_2;
    }
    result
}

/// The deliberately degraded, deck-heavy configuration ADVISORY-007 §1
/// requires: item 3's own falsifiability demonstration, and the circuit-3
/// standing rule applied to the contract itself — "where the outcome is an
/// enforcement mechanism, the work demonstrates the specific failure the
/// mechanism must catch."
///
/// **Not a realistic product configuration.** The composer never produces
/// this on its own; nothing in `superb-core` reads `calibration_items_per_session`
/// as anything but a host knob. It exists purely to prove the gate
/// discriminates: twenty real-word deck draws a session, all real (no
/// pseudoword noise diluting the count), against the same one passage a
/// session the ordinary battery reads — so the deck's own word count
/// dominates regardless of how many words that one passage carries.
pub fn deck_heavy_config(base: &SimConfig) -> SimConfig {
    SimConfig {
        calibration_items_per_session: 20,
        calibration_real_rate: 1.0,
        ..*base
    }
}

/// Directive 4: the reachable ceiling — the sourced share at the most
/// favourable `sourced_preference` the mechanism permits, holding the real
/// corpus fixed. The exact technique `calibration.rs::sweep_multiplier`
/// already uses against the synthetic library (ADVISORY-005 §2's own
/// instrument), pointed at real content instead. **Never a recommendation
/// for `sourced_preference`** — same prohibition `CALIBRATION.md` states for
/// its own sweep, and for the same reason: this measures how far the
/// multiplier alone can go, it does not choose a value.
///
/// Returns `(ceiling_share, multiplier_that_reached_it)`.
pub fn reachable_sourced_ceiling(
    seeds: &[u64],
    config: &SimConfig,
    corpus: &RealCorpus,
    multipliers: &[f64],
) -> (f64, f64) {
    let mut ceiling = 0.0_f64;
    let mut ceiling_multiplier = 0.0_f64;
    for &multiplier in multipliers {
        let tuning = tuning_with_sourced_preference(multiplier);
        let mut sourced = 0usize;
        let mut composed = 0usize;
        for &seed in seeds {
            let outcome = simulation::run_real(seed, 0.0, config, &tuning, corpus);
            sourced += outcome.pools.sourced_sessions;
            composed += outcome.pools.composed_sessions;
        }
        let total = sourced + composed;
        let share = if total == 0 {
            0.0
        } else {
            sourced as f64 / total as f64
        };
        if share > ceiling {
            ceiling = share;
            ceiling_multiplier = multiplier;
        }
    }
    (ceiling, ceiling_multiplier)
}

#[cfg(test)]
mod tests {
    use std::sync::OnceLock;

    use super::*;
    use crate::corpus::live_content_root;

    /// Loaded once for every test in this module, not once per test — the
    /// corpus itself does not change between them, and re-parsing 2,600+
    /// JSON files five times over was most of this file's own test time.
    fn corpus() -> &'static RealCorpus {
        static CORPUS: OnceLock<RealCorpus> = OnceLock::new();
        CORPUS.get_or_init(|| RealCorpus::load(&live_content_root()))
    }

    /// A short horizon and a short seed list for the tests in this file —
    /// the gate-discrimination question (does deck-heavy read red, does
    /// ordinary read green) does not need `REPORT.md`'s own 240-session,
    /// 3-seed scale to answer; it needs enough sessions that both
    /// configurations produce a nonzero encounter count. Kept short so
    /// `cargo test -p superb-sim` stays fast against a 2,600-excerpt real
    /// corpus cloned into every reading session's `ContentFrame` — the full
    /// scale runs once, offline, in `src/bin/session_battery.rs`, and is
    /// what `SESSION_BATTERY.md`'s committed numbers come from.
    fn small_config() -> SimConfig {
        SimConfig {
            sessions: 15,
            ..SimConfig::default()
        }
    }
    const TEST_SEEDS: [u64; 2] = [1, 2];

    #[test]
    fn the_ordinary_battery_favours_passages_over_the_deck() {
        let tuning = Tuning::default();
        let result = run_battery(&TEST_SEEDS, &small_config(), &tuning, corpus());
        assert!(
            result.gate_passes(),
            "ordinary battery: deck {} vs passages {} (composed {} + sourced {}) — expected \
             passages to be the majority",
            result.encounters.deck,
            result.encounters.passages(),
            result.encounters.composed_for_gap,
            result.encounters.sourced,
        );
    }

    #[test]
    fn the_deck_heavy_configuration_flips_the_gate_red() {
        let tuning = Tuning::default();
        let degraded = deck_heavy_config(&small_config());
        let result = run_battery(&TEST_SEEDS, &degraded, &tuning, corpus());
        assert!(
            !result.gate_passes(),
            "deck-heavy battery: deck {} vs passages {} — expected the deck to dominate, proving \
             the gate can fail",
            result.encounters.deck,
            result.encounters.passages(),
        );
    }

    #[test]
    fn composed_for_support_reads_zero_under_the_current_mechanism() {
        let tuning = Tuning::default();
        let result = run_battery(&TEST_SEEDS, &small_config(), &tuning, corpus());
        assert_eq!(
            result.encounters.composed_for_support, 0,
            "composed_for_support should be unreachable until the sourced/composed precedence \
             (ADR-015's third amendment) lands — see EncounterTally's own doc comment"
        );
    }

    #[test]
    fn due_list_coverage_rates_stay_within_zero_and_one() {
        let tuning = Tuning::default();
        let result = run_battery(&TEST_SEEDS, &small_config(), &tuning, corpus());
        assert!((0.0..=1.0).contains(&result.due_list_coverage.at_least_1_rate()));
        assert!((0.0..=1.0).contains(&result.due_list_coverage.at_least_2_rate()));
        assert!(result.due_list_coverage.at_least_1 >= result.due_list_coverage.at_least_2);
    }

    #[test]
    fn reachable_ceiling_is_at_least_the_shipped_share() {
        let config = small_config();
        let shipped_multiplier =
            crate::tuning_extract::AdrConstants::from_tuning(&Tuning::default()).sourced_preference;
        // Same unit `reachable_sourced_ceiling` reads (session-level pool
        // share), computed at the shipped multiplier by including it as one
        // of the sweep's own points — so "the ceiling is at least the
        // shipped share" is true by construction of the sweep, not by a
        // second, differently-scaled computation that could disagree over
        // units.
        let (ceiling, _multiplier) =
            reachable_sourced_ceiling(&TEST_SEEDS, &config, corpus(), &[shipped_multiplier, 64.0]);
        let (shipped_share, _) =
            reachable_sourced_ceiling(&TEST_SEEDS, &config, corpus(), &[shipped_multiplier]);
        assert!(
            ceiling + 1e-9 >= shipped_share,
            "ceiling {ceiling} should be at least the shipped share {shipped_share} — a sweep \
             that includes the shipped multiplier cannot read lower than it"
        );
    }
}
