//! The oracle: the one place this crate stands in for a human reader.
//!
//! **The rule this module exists to hold, stated once and enforced by
//! construction:** every function here takes a `true_theta: f64` the caller
//! already owns (`vocabulary::WordSpec::true_difficulty` and the learner's
//! own hidden ability) and an `&mut Rng` — never a `&LearnerState`, never a
//! `&Tuning`, never anything read out of `superb_core`. There is no
//! `superb_core` import in this file. That is not a style choice; it is the
//! brief's own falsifier: "an oracle that consults the estimate proves
//! nothing." A reviewer checking this claim does not have to read the
//! module's logic, only its `use` list.
//!
//! The response model is the one-parameter logistic curve `ability.rs`'s own
//! doc comment states in prose (the engine's Fisher-scoring step divides its
//! residual against this same curve's expectation by accumulated
//! information — the curve itself is public knowledge, not an engine
//! secret). Reusing its shape here is the shared assumption the brief's own
//! "What these clauses do not catch" section names and asks to be said out loud
//! rather than hidden: this crate's ground truth and the engine's estimator
//! agree on the *model family*, because both were written by the same
//! project. What they do not share is any value — true θ is never the
//! engine's θ̂, and a word's `true_difficulty` is never read by
//! `superb_core::ability::update_theta`, which only ever sees the
//! `difficulty` the host (this crate, playing host) hands it through
//! `Frame::ItemDifficulty`.

use crate::rng::Rng;

/// The probability a learner at `true_theta` knows an item at `difficulty`,
/// both on the same logit scale — identical in shape to
/// `superb_core::ability`'s private `response_probability`, reimplemented
/// here rather than imported, because it is not exported (correctly: it is
/// engine-internal machinery, not a fact the host is entitled to ask about a
/// *specific* learner's estimate) and because the oracle must be able to
/// state, truthfully, that it imports nothing from `superb_core` at all.
pub fn response_probability(true_theta: f64, difficulty: f64) -> f64 {
    let logit = true_theta - difficulty;
    1.0 / (1.0 + (-logit).exp())
}

/// Draw whether the learner knows a real item at `difficulty`, given their
/// hidden `true_theta`. One RNG draw, compared against
/// [`response_probability`] — a Bernoulli trial, not a threshold, so the
/// same `true_theta` and `difficulty` still produce different answers on
/// different draws, exactly as a real reader's moment-to-moment recall
/// would.
pub fn knows_real_item(rng: &mut Rng, true_theta: f64, difficulty: f64) -> bool {
    rng.chance(response_probability(true_theta, difficulty))
}

/// Draw whether the learner *claims* to know a pseudoword. Pseudowords do
/// not exist, so there is no difficulty and no response-probability curve —
/// only `overclaim_rate`, the fraction of pseudowords this particular
/// synthetic learner dishonestly claims. Assertion 4's two learners are
/// exactly this function called with `0.0` (never claims) and `1.0` (always
/// claims); every other scenario in this crate uses a small, honest-ish
/// rate so pseudowords are ordinary background evidence rather than the
/// thing under test.
pub fn claims_pseudoword(rng: &mut Rng, overclaim_rate: f64) -> bool {
    rng.chance(overclaim_rate)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn response_probability_is_one_half_at_the_learners_own_difficulty() {
        let p = response_probability(0.4, 0.4);
        assert!((p - 0.5).abs() < 1e-12);
    }

    #[test]
    fn response_probability_rises_with_ability_and_falls_with_difficulty() {
        let easy_for_strong = response_probability(3.0, -1.0);
        let hard_for_weak = response_probability(-3.0, 1.0);
        assert!(easy_for_strong > 0.9);
        assert!(hard_for_weak < 0.1);
    }

    #[test]
    fn claims_pseudoword_never_claims_at_rate_zero() {
        let mut rng = Rng::new(1);
        for _ in 0..200 {
            assert!(!claims_pseudoword(&mut rng, 0.0));
        }
    }

    #[test]
    fn claims_pseudoword_always_claims_at_rate_one() {
        let mut rng = Rng::new(1);
        for _ in 0..200 {
            assert!(claims_pseudoword(&mut rng, 1.0));
        }
    }
}
