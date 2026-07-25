//! Assertion 4: the pseudoword correction shrinks θ for an over-claiming
//! learner. "One who claims every pseudoword must end below one who claims
//! none, same real vocabulary" (the brief's own words) — the first time
//! BRIEF-010's mechanism meets a full session rather than
//! `ability.rs`'s own unit test.
//!
//! **The isolation this module exists to guarantee.** Two learners must see
//! *exactly* the same real-word evidence — same items, same order, same
//! "knew" answers — so the only thing that can move them apart is the one
//! thing under test: whether a pseudoword is claimed. Running two
//! independent RNG streams through the same session logic cannot promise
//! that (a different pseudoword draw shifts the stream's position
//! differently for each learner from that point on). This module instead
//! draws the whole calibration sequence **once**, decides every real-word
//! "knew" answer once, and only decides each pseudoword's claim per learner
//! at replay time — deterministic lockstep by construction, not by
//! coincidence of matched RNG calls.

use std::collections::BTreeMap;

use superb_core::{LearnerState, Timestamp, Tuning};

use crate::oracle::knows_real_item;
use crate::rng::Rng;
use crate::simulation::{SimConfig, dispatch_deck_swipe};
use crate::vocabulary::{Vocabulary, generate};

/// One pre-decided calibration draw, real-word evidence already resolved,
/// pseudoword claim left for replay time (see this module's own doc
/// comment).
enum Draw {
    Real { item_id: String, knew: bool },
    Pseudoword { item_id: String },
}

/// What one seed/true-θ pair produced for both learners.
#[derive(Debug, Clone, Copy)]
pub struct ComparisonResult {
    pub seed: u64,
    pub true_theta: f64,
    pub overclaimer_final_theta: f64,
    pub honest_final_theta: f64,
}

/// Run the twin-learner comparison for one `(seed, true_theta)` pair, over
/// `config.sessions * config.calibration_items_per_session` total
/// calibration draws — the same cadence [`crate::simulation::run`] uses, so
/// this is genuinely "a full session," repeated, and not a shortcut through
/// a single deck.
pub fn run(seed: u64, true_theta: f64, config: &SimConfig) -> ComparisonResult {
    let mut rng = Rng::new(seed);
    let vocabulary: Vocabulary = generate(
        &mut rng,
        0,
        config.calibration_pool_size,
        config.pseudoword_pool_size,
        0.0,
    );

    let total_draws = config.sessions * config.calibration_items_per_session;
    let draws: Vec<Draw> = (0..total_draws)
        .map(|_| {
            draw_one(
                &mut rng,
                &vocabulary,
                true_theta,
                config.calibration_real_rate,
            )
        })
        .collect();

    let tuning = Tuning::default();
    let now = Timestamp::from_millis_since_epoch(0);
    let mut overclaimer = fresh_learner(seed, &tuning);
    let mut honest = fresh_learner(seed, &tuning);

    for draw in &draws {
        match draw {
            Draw::Real { item_id, knew } => {
                dispatch_deck_swipe(
                    &mut overclaimer,
                    &vocabulary,
                    &tuning,
                    now,
                    item_id.clone(),
                    false,
                    *knew,
                );
                dispatch_deck_swipe(
                    &mut honest,
                    &vocabulary,
                    &tuning,
                    now,
                    item_id.clone(),
                    false,
                    *knew,
                );
            }
            Draw::Pseudoword { item_id } => {
                // The one place the two learners diverge: the overclaimer
                // claims every pseudoword, the honest learner claims none.
                dispatch_deck_swipe(
                    &mut overclaimer,
                    &vocabulary,
                    &tuning,
                    now,
                    item_id.clone(),
                    true,
                    true,
                );
                dispatch_deck_swipe(
                    &mut honest,
                    &vocabulary,
                    &tuning,
                    now,
                    item_id.clone(),
                    true,
                    false,
                );
            }
        }
    }

    ComparisonResult {
        seed,
        true_theta,
        overclaimer_final_theta: overclaimer.theta(),
        honest_final_theta: honest.theta(),
    }
}

fn draw_one(rng: &mut Rng, vocabulary: &Vocabulary, true_theta: f64, real_rate: f64) -> Draw {
    let is_pseudoword = !rng.chance(real_rate);
    if is_pseudoword {
        let index = rng.below(vocabulary.pseudowords.len());
        Draw::Pseudoword {
            item_id: vocabulary.pseudowords[index].clone(),
        }
    } else {
        let index = rng.below(vocabulary.calibration.len());
        let word = &vocabulary.calibration[index];
        let knew = knows_real_item(rng, true_theta, word.true_difficulty);
        Draw::Real {
            item_id: word.id.clone(),
            knew,
        }
    }
}

fn fresh_learner(seed: u64, tuning: &Tuning) -> LearnerState {
    LearnerState::new(
        seed,
        0,
        0.0,
        tuning.theta_prior_information(),
        BTreeMap::new(),
        BTreeMap::new(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_overclaimer_ends_strictly_below_the_honest_learner() {
        let config = SimConfig::default();
        let result = run(11, 0.0, &config);
        assert!(
            result.overclaimer_final_theta < result.honest_final_theta,
            "overclaimer {} should be strictly below honest {}",
            result.overclaimer_final_theta,
            result.honest_final_theta
        );
    }

    #[test]
    fn the_comparison_is_deterministic_from_its_seed() {
        let config = SimConfig::default();
        let a = run(5, 1.0, &config);
        let b = run(5, 1.0, &config);
        assert_eq!(a.overclaimer_final_theta, b.overclaimer_final_theta);
        assert_eq!(a.honest_final_theta, b.honest_final_theta);
    }

    #[test]
    fn holds_across_a_spread_of_true_theta_values() {
        let config = SimConfig::default();
        for true_theta in [-3.5, -1.0, 0.0, 1.0, 3.5] {
            let result = run(23, true_theta, &config);
            assert!(
                result.overclaimer_final_theta < result.honest_final_theta,
                "true_theta {true_theta}: overclaimer {} should be strictly below honest {}",
                result.overclaimer_final_theta,
                result.honest_final_theta
            );
        }
    }
}
