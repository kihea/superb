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

/// Draw whether a **bluffing** learner *claims* to know a real item at
/// `difficulty`, given hidden `true_theta` and one propensity `b` — the same
/// propensity that drives [`claims_pseudoword`] for this learner (BRIEF-017).
///
/// **The modelling assumption this function is, stated as one, not smuggled
/// in as a fact:** a single `b ∈ [0, 1]` drives both a learner's willingness
/// to claim a pseudoword they have not met and their willingness to claim a
/// real word they do not actually know. Real bluffing readers may not share
/// one propensity across both behaviours; nothing in this crate measures
/// that they do. What this link buys is a synthetic learner whose real-word
/// evidence is no longer unbiased in simulation — the gap BRIEF-010's
/// correction has had no calibration target for since it was written
/// (`superb_core::ability::overclaim_correction`'s own doc comment).
///
/// **Draws honestly first**, with exactly the one [`knows_real_item`] call
/// that function itself makes. An honest "known" is claimed outright. An
/// honest "not known" gets a second, independent chance — at probability
/// `b` — to be claimed anyway. So bluffing can only ever inflate a real-word
/// answer, never deflate one: nothing here ever turns an honest "known" into
/// a claimed "not known".
///
/// **At `b <= 0.0` the second draw is skipped rather than drawn and
/// discarded**, so the whole sequence this function drives an `Rng` through
/// — not merely one answer — is identical to calling [`knows_real_item`]
/// directly: same seed, same calls, same results, checked by
/// [`tests::bluffs_real_item_at_zero_propensity_matches_the_honest_draw_exactly`].
pub fn bluffs_real_item(rng: &mut Rng, true_theta: f64, difficulty: f64, b: f64) -> bool {
    if knows_real_item(rng, true_theta, difficulty) {
        return true;
    }
    if b <= 0.0 {
        return false;
    }
    rng.chance(b)
}

/// How much one prior clean encounter with a word raises the learner's
/// effective ability *on that word*, in logits.
///
/// **Why this constant has to exist, said plainly: without it the synthetic
/// learner cannot learn.** Every function above models recall as a fixed
/// property of `(true_theta, difficulty)`, so a word harder than the reader is
/// a word they will fail forever, no matter how many times they meet it. That
/// is not a small idealisation in a vocabulary app — it is the denial of the
/// product's entire claim. It stayed invisible while a stand-in composer kept
/// the simulated vocabulary from growing; the moment a real composer started
/// introducing words, the consequence arrived in one line of output: every
/// tracked word permanently due, the backlog guard permanently active, and
/// ADR-015's literature preference therefore permanently suspended.
///
/// 0.35 logits per clean encounter means the ten encounters
/// `encounter_target` aims at are worth about 3.5 logits — enough to carry a
/// word from "reliably failed" to "reliably known" across the band this
/// crate's difficulties are drawn from. It is a modelling assumption of this
/// crate and nothing else reads it: the engine has no such constant and must
/// not, because how fast a real reader acquires a word is the thing the
/// product is trying to find out, not something it may assume.
pub const ACQUISITION_PER_CLEAN_ENCOUNTER: f64 = 0.35;

/// The most any amount of exposure can raise effective ability on one word.
///
/// A ceiling rather than an unbounded sum, because an unbounded one would let
/// enough repetitions make any word certain, and "met it twenty times" is not
/// the same as "knows it." It also keeps the model from quietly guaranteeing
/// the assertions it is being used to check.
pub const ACQUISITION_CEILING: f64 = 4.0;

/// Draw whether the learner knows a real item they have met cleanly
/// `clean_encounters` times before.
///
/// The exposure count comes from the *host's* own record of what it has put in
/// front of this reader — the simulator counts its own passages
/// (`simulation::RunState`) — never from `LearnerState`, and never from
/// anything `superb_core` computed. That distinction is the whole oracle
/// boundary: how often a reader has met a word is a fact about the world, and
/// the host is entitled to it; what the *engine believes* about that word is
/// not, and is what an oracle reading it would be cheating with.
pub fn knows_real_item_after(
    rng: &mut Rng,
    true_theta: f64,
    difficulty: f64,
    clean_encounters: usize,
) -> bool {
    let gained =
        (clean_encounters as f64 * ACQUISITION_PER_CLEAN_ENCOUNTER).min(ACQUISITION_CEILING);
    knows_real_item(rng, true_theta + gained, difficulty)
}

/// Draw whether the learner reads a passage about a topic they like `taste`
/// much to the end (ADR-022).
///
/// `taste` is this synthetic reader's hidden liking, 0.0 to 1.0, invented by
/// `vocabulary::generate` and never shown to the engine. The engine learns only
/// what ADR-022 lets it learn — that a passage was finished, or that it was
/// left. Whether its estimate comes to resemble this number is the
/// recommender's whole assertion, and it would be worth nothing if the engine
/// could see it.
///
/// **0.55 at total indifference, 0.95 at total enthusiasm**, and the floor
/// matters as much as the slope. Two constraints pin it.
///
/// Floored well above zero because a reader who *never* finishes a disliked
/// topic hands the recommender a noiseless signal any estimator would recover.
/// The interesting question is whether taste survives noise, so the model keeps
/// plenty of it: even a topic this reader is indifferent to gets finished more
/// often than not.
///
/// Floored *high* because an abandonment rate near half is not a taste model,
/// it is a broken product — and it behaves like one. At 0.15/0.85 the simulator
/// stopped producing automatic words entirely: an abandoned passage schedules
/// nothing and logs no clean frame, so half the reading sessions taught nothing
/// and the schedule could not keep up. A reader who walks out of one passage in
/// two has a problem the recommender cannot fix.
pub fn finishes_passage(rng: &mut Rng, taste: f64) -> bool {
    rng.chance(0.55 + 0.4 * taste.clamp(0.0, 1.0))
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

    /// BRIEF-017's free regression test, taken literally: at `b = 0.0` the
    /// bluffing learner is precisely today's honest learner — not merely on
    /// one answer, but across a whole sequence drawn from the same seed,
    /// because the second draw is skipped entirely rather than drawn and
    /// discarded.
    #[test]
    fn bluffs_real_item_at_zero_propensity_matches_the_honest_draw_exactly() {
        for seed in [1u64, 2, 3, 42, 1000] {
            for true_theta in [-3.0, -1.0, 0.0, 1.0, 3.0] {
                for difficulty in [-2.0, -0.4, 0.0, 0.7, 2.0] {
                    let mut honest_rng = Rng::new(seed);
                    let mut bluff_rng = Rng::new(seed);
                    for draw in 0..30 {
                        let honest = knows_real_item(&mut honest_rng, true_theta, difficulty);
                        let bluffed = bluffs_real_item(&mut bluff_rng, true_theta, difficulty, 0.0);
                        assert_eq!(
                            honest, bluffed,
                            "seed {seed}, true_theta {true_theta}, difficulty {difficulty}, \
                             draw {draw}: b=0.0 bluffer disagreed with the honest oracle"
                        );
                    }
                }
            }
        }
    }

    /// Bluffing can only ever inflate a real-word answer: an honest "known"
    /// is always claimed, and the only thing `b` can do is turn an honest
    /// "not known" into a claim — never the reverse.
    #[test]
    fn bluffing_never_turns_an_honest_known_into_a_claimed_not_known() {
        let mut rng = Rng::new(99);
        for _ in 0..500 {
            let true_theta = rng.range(-4.0, 4.0);
            let difficulty = rng.range(-4.0, 4.0);
            let b = rng.range(0.0, 1.0);

            let mut fork = rng.clone();
            let honest = knows_real_item(&mut fork, true_theta, difficulty);
            let bluffed = bluffs_real_item(&mut rng, true_theta, difficulty, b);

            if honest {
                assert!(bluffed, "an honest known must always be claimed");
            }
        }
    }
}
