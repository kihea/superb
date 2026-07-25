//! θ, its standard error, and the pseudoword correction (BRIEF-010).
//!
//! `docs/engine-contract.md` §3 names `ThetaUpdated { theta, se }` as the
//! ability effect and reserves `theta_update_rate` and the band offsets in
//! `tuning.toml` for this module to spend. §4 defines the θ band the
//! composer will one day select against: `[θ + band_low, θ + band_high]`.
//! §5 states the two properties any implementation has to hold no matter
//! how the arithmetic inside changes: θ stays bounded, and its standard
//! error never widens across a session.
//!
//! What's here: [`update_theta`], the pure per-observation update that moves
//! θ toward the evidence one `DeckSwipe` carries — a claim of "knew" or not,
//! against an item's difficulty — with the pseudoword correction folded into
//! the same call rather than a second event a caller could forget to send
//! (Done clause 5); and [`band`], the one place engine-contract §4's
//! interval is computed from θ.
//!
//! What this module deliberately does not do: decide whether θ has
//! *converged* to a learner's true ability. That is the simulator's
//! assertion (engine-contract §5), checked over sixty synthetic sessions,
//! not a property of one call. Pinning a specific θ after a specific
//! sequence here would tie a later brief's simulator to today's response
//! model instead of the other way around.

use serde::Serialize;

use crate::tuning::Tuning;

/// The engine's ability effect (engine-contract §3): `ThetaUpdated { theta,
/// se }`, matched field-for-field against the contract rather than
/// approximated.
///
/// Boundary tier in `wire-roster.toml`, not durable: this type is never
/// reachable from [`crate::LearnerState`]. `LearnerState.theta` and
/// `.theta_se` are what this effect describes the host having just written
/// there; the effect itself is only ever the host's cue to persist and
/// re-render (engine-contract §3 — "effects are a description of what
/// changed, not commands").
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct ThetaUpdated {
    /// The learner's ability estimate after this observation.
    pub theta: f64,
    /// θ's standard error after this observation.
    pub se: f64,
}

/// What [`update_theta`] decided.
///
/// `theta` and `theta_se` are always equal to `effect.theta` and
/// `effect.se` — both are exposed so a caller writing
/// `LearnerState.theta` / `.theta_se` does not have to reach into the effect
/// payload to get them (the same shape `scheduler::ScheduleDecision` uses
/// for `due` / `interval_days` against `IntervalSet`).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ThetaUpdate {
    /// The learner's ability estimate after this observation. Write this
    /// into `LearnerState.theta`.
    pub theta: f64,
    /// θ's standard error after this observation. Write this into
    /// `LearnerState.theta_se`.
    pub theta_se: f64,
    /// The effect to persist and re-render (engine-contract §3).
    pub effect: ThetaUpdated,
}

/// The one-parameter logistic response probability: how likely a learner at
/// ability `theta` is to know an item of the given `difficulty`, both read
/// on the same logit scale θ itself lives on — the scale `tuning.toml`'s
/// `band_low` / `band_high` offsets and `theta_min` / `theta_max` bounds are
/// stated in, and the scale the host's item difficulties are expected to
/// arrive on (this brief consumes difficulties; it does not calibrate them).
///
/// Saturates to exactly `0.0` or `1.0` for an extreme difference rather than
/// overflowing to `NaN`: `(-logit).exp()` grows toward or shrinks toward the
/// `f64` limits as `logit` moves away from zero, and IEEE 754 division by an
/// infinite or zero denominator here still produces a finite `0.0` or `1.0`,
/// never a non-finite result.
fn response_probability(theta: f64, difficulty: f64) -> f64 {
    let logit = theta - difficulty;
    1.0 / (1.0 + (-logit).exp())
}

/// Move θ and its standard error by one observation — one `DeckSwipe`'s
/// worth of evidence (engine-contract §3).
///
/// Pure (engine-contract §1): `theta`, `theta_se`, `difficulty`, `knew`,
/// `is_pseudoword`, and `tuning` are the whole input; nothing else is read
/// and nothing is mutated in place.
///
/// **Real words** (`is_pseudoword` false) move θ by the response model
/// (Done clause 2): the residual between the claim — `1.0` for "knew",
/// `0.0` otherwise — and [`response_probability`]'s expectation, scaled by
/// `tuning.theta_update_rate`. A correct claim on a hard item (high
/// `difficulty`, relative to `theta`) sits far below what the model already
/// expected, so its residual — and its step — is larger than the same claim
/// on an easy item, whose expectation was already close to certain. This
/// asymmetry is the whole reason to run a response model instead of a
/// running average (the brief's own framing).
///
/// **Pseudowords** (`is_pseudoword` true) do not exist, so there is no
/// difficulty for one to be evaluated against — `difficulty` is ignored on
/// this branch entirely. Claiming to know one (`knew` true) is over-claiming
/// by definition and steps θ down by `tuning.pseudoword_penalty` (Done
/// clause 5): folded into this same per-observation call rather than a
/// second event a caller could forget to send, so a session where a learner
/// over-claims on pseudowords accumulates the correction one observation at
/// a time, without this function or its caller ever having to compute a
/// session-wide claim rate. Honestly saying "don't know" to a pseudoword is
/// the expected response and moves θ by nothing — there is nothing to
/// correct for and nothing to reward, since a pseudoword carries no real
/// vocabulary evidence either way.
///
/// **θ is clamped last**, to `[tuning.theta_min, tuning.theta_max]`, with
/// `f64::max` then `f64::min` rather than a branch — both return their
/// non-`NaN` operand when the other one is `NaN` (the same idiom
/// `scheduler::schedule_encounter` uses to clamp `interval_days`), so a
/// `NaN` produced upstream by adversarial or corrupted input collapses to a
/// bound instead of propagating (Done clause 8: θ never becomes `NaN` or
/// infinite).
///
/// **The standard error only ever shrinks** (Done clause 4; engine-contract
/// §5). `theta_se` is sanitized first — a `NaN`, negative, or infinite input
/// collapses to `0.0`, already the tightest a standard error can be — then
/// multiplied by `1.0 - tuning.theta_update_rate`, a factor
/// `Tuning::from_toml_str` has already checked is strictly between 0 and 1.
/// Multiplying a non-negative number by a factor strictly between 0 and 1
/// can only shrink it, or, at `theta_se == 0.0`, hold it there — never widen
/// it, on either the real-word or the pseudoword branch, and independent of
/// how informative this particular observation was: the arithmetic this
/// brief is scoped to is deliberately this simple (the brief's own
/// constraint — no `statrs`, no `nalgebra` — rules out an
/// information-weighted shrinkage that would need one to get right).
pub fn update_theta(
    theta: f64,
    theta_se: f64,
    difficulty: f64,
    knew: bool,
    is_pseudoword: bool,
    tuning: &Tuning,
) -> ThetaUpdate {
    let delta = if is_pseudoword {
        if knew {
            -tuning.pseudoword_penalty
        } else {
            0.0
        }
    } else {
        let claim = if knew { 1.0 } else { 0.0 };
        let expected = response_probability(theta, difficulty);
        tuning.theta_update_rate * (claim - expected)
    };

    let raw_theta = theta + delta;
    let new_theta = raw_theta.max(tuning.theta_min).min(tuning.theta_max);

    let sanitized_se = if theta_se.is_finite() {
        theta_se.max(0.0)
    } else {
        0.0
    };
    let new_se = sanitized_se * (1.0 - tuning.theta_update_rate);

    let effect = ThetaUpdated {
        theta: new_theta,
        se: new_se,
    };

    ThetaUpdate {
        theta: new_theta,
        theta_se: new_se,
        effect,
    }
}

/// engine-contract §4's θ band: `[θ + band_low, θ + band_high]` — the only
/// place it is computed (Done clause 7). `band_low` is negative in the
/// shipped tuning, so the low edge is a subtraction in practice, but this
/// function does not special-case that sign: it only ever adds the two
/// configured offsets to θ, so a sign change to either constant in
/// `tuning.toml` moves the band correctly without this function's own
/// arithmetic having to change.
pub fn band(theta: f64, tuning: &Tuning) -> (f64, f64) {
    (theta + tuning.band_low, theta + tuning.band_high)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Done clause 2: a correct claim on a hard item moves θ more than a
    /// correct claim on an easy one, because the response model's
    /// expectation of "knew" was already lower for the hard item.
    #[test]
    fn correct_claim_moves_theta_more_on_a_hard_item_than_an_easy_one() {
        let tuning = Tuning::default();
        let theta = 0.0;
        let se = 1.0;

        let hard = update_theta(theta, se, theta + 3.0, true, false, &tuning);
        let easy = update_theta(theta, se, theta - 3.0, true, false, &tuning);

        let hard_step = hard.theta - theta;
        let easy_step = easy.theta - theta;

        assert!(
            hard_step > 0.0 && easy_step > 0.0,
            "a correct claim should move θ up on both items: hard {hard_step}, easy {easy_step}"
        );
        assert!(
            hard_step > easy_step,
            "a correct claim on a hard item ({hard_step}) should move θ more than on an easy \
             one ({easy_step})"
        );
    }

    /// Done clause 3 / 8: one hundred consecutive identical claims in the
    /// same direction is the only way to reach the clamp — an extremely hard
    /// item claimed known, over and over, walks θ straight to `theta_max`
    /// and holds it there rather than overshooting or oscillating.
    #[test]
    fn theta_clamps_at_theta_max_after_one_hundred_consecutive_correct_claims_on_an_extremely_hard_item()
     {
        let tuning = Tuning::default();
        let mut theta = 0.0;
        let se = 1.0;
        let extremely_hard_difficulty = 1000.0;

        for step in 0..100 {
            let update = update_theta(theta, se, extremely_hard_difficulty, true, false, &tuning);
            assert!(
                update.theta <= tuning.theta_max,
                "step {step}: θ {} exceeded theta_max {}",
                update.theta,
                tuning.theta_max
            );
            theta = update.theta;
        }

        assert_eq!(theta, tuning.theta_max);
    }

    /// The same clamp, from the other direction: one hundred consecutive
    /// pseudoword over-claims walk θ straight to `theta_min` and hold it
    /// there.
    #[test]
    fn theta_clamps_at_theta_min_after_one_hundred_consecutive_pseudoword_overclaims() {
        let tuning = Tuning::default();
        let mut theta = 0.0;
        let se = 1.0;

        for step in 0..100 {
            let update = update_theta(theta, se, 0.0, true, true, &tuning);
            assert!(
                update.theta >= tuning.theta_min,
                "step {step}: θ {} fell below theta_min {}",
                update.theta,
                tuning.theta_min
            );
            theta = update.theta;
        }

        assert_eq!(theta, tuning.theta_min);
    }

    /// Done clause 5, read literally: construct the over-claiming learner —
    /// knows every real word, knows every pseudoword — and the honest
    /// learner who claims no pseudowords, run both through the same
    /// sequence of items, and check the *sign* of the difference rather
    /// than merely that a number changed.
    #[test]
    fn overclaiming_pseudowords_leaves_theta_strictly_lower_than_an_honest_learner() {
        let tuning = Tuning::default();
        // Alternating real words and pseudowords, at a range of
        // difficulties, so the sequence exercises both branches of
        // `update_theta` repeatedly rather than only once.
        let items: [(f64, bool); 8] = [
            (-1.0, false),
            (0.2, true),
            (0.5, false),
            (-0.3, true),
            (1.0, false),
            (0.0, true),
            (-0.6, false),
            (0.8, true),
        ];

        let mut overclaimer_theta = 0.0;
        let mut overclaimer_se = 1.0;
        let mut honest_theta = 0.0;
        let mut honest_se = 1.0;

        for (difficulty, is_pseudoword) in items {
            // The over-claimer says "knew" to everything, real or not. The
            // honest learner says "knew" to every real word — identically to
            // the over-claimer — and "didn't know" to every pseudoword.
            let overclaimer_knew = true;
            let honest_knew = !is_pseudoword;

            let overclaimer_update = update_theta(
                overclaimer_theta,
                overclaimer_se,
                difficulty,
                overclaimer_knew,
                is_pseudoword,
                &tuning,
            );
            overclaimer_theta = overclaimer_update.theta;
            overclaimer_se = overclaimer_update.theta_se;

            let honest_update = update_theta(
                honest_theta,
                honest_se,
                difficulty,
                honest_knew,
                is_pseudoword,
                &tuning,
            );
            honest_theta = honest_update.theta;
            honest_se = honest_update.theta_se;
        }

        assert!(
            overclaimer_theta < honest_theta,
            "the over-claimer's θ ({overclaimer_theta}) should be strictly lower than the \
             honest learner's ({honest_theta})"
        );
    }

    /// Honestly rejecting a pseudoword is the expected response and moves θ
    /// by nothing — only the standard-error shrink (shared by every
    /// observation) changes it.
    #[test]
    fn honest_pseudoword_rejection_does_not_move_theta() {
        let tuning = Tuning::default();
        let theta = 0.3;
        let se = 1.0;

        let update = update_theta(theta, se, 0.0, false, true, &tuning);

        assert_eq!(update.theta, theta);
    }

    /// Done clause 4 / engine-contract §5: the standard error never widens,
    /// checked at the boundary the Verifier names explicitly — a session
    /// that starts with `se` already at zero holds it there rather than
    /// somehow producing a positive one.
    #[test]
    fn standard_error_already_at_zero_stays_at_zero() {
        let tuning = Tuning::default();

        let update = update_theta(0.0, 0.0, 0.0, true, false, &tuning);

        assert_eq!(update.theta_se, 0.0);
    }

    /// Done clause 7: the band's width is exactly `band_high - band_low`
    /// for any θ, and the band shifts with θ rather than being pinned.
    #[test]
    fn band_width_is_constant_and_the_band_shifts_with_theta() {
        let tuning = Tuning::default();

        for theta in [-4.0, -1.0, 0.0, 0.6, 2.5, 4.0] {
            let (low, high) = band(theta, &tuning);
            assert!((high - low - (tuning.band_high - tuning.band_low)).abs() < 1e-12);
            assert!((low - (theta + tuning.band_low)).abs() < 1e-12);
            assert!((high - (theta + tuning.band_high)).abs() < 1e-12);
        }
    }

    /// `ThetaUpdated` matches engine-contract §3's `ThetaUpdated { theta,
    /// se }` literally: exactly these two keys, nothing else.
    #[test]
    fn theta_updated_serializes_as_exactly_theta_and_se() {
        let effect = ThetaUpdated {
            theta: 0.4,
            se: 0.8,
        };

        let value = serde_json::to_value(effect).expect("ThetaUpdated serializes");
        let object = value
            .as_object()
            .expect("ThetaUpdated serializes as an object");

        assert_eq!(
            object.keys().collect::<std::collections::BTreeSet<_>>(),
            std::collections::BTreeSet::from([&"theta".to_string(), &"se".to_string()])
        );
        assert_eq!(object["theta"], 0.4);
        assert_eq!(object["se"], 0.8);
    }

    /// Verifier: "an item with extreme difficulty" — a claim against a
    /// difficulty far outside the θ range still produces a finite,
    /// in-range θ, never a panic and never `NaN`.
    #[test]
    fn extreme_difficulty_produces_a_finite_in_range_theta() {
        let tuning = Tuning::default();

        for difficulty in [1e10, -1e10, f64::MAX, f64::MIN] {
            for knew in [true, false] {
                let update = update_theta(0.0, 1.0, difficulty, knew, false, &tuning);
                assert!(
                    update.theta.is_finite(),
                    "difficulty {difficulty}, knew {knew}"
                );
                assert!(update.theta >= tuning.theta_min);
                assert!(update.theta <= tuning.theta_max);
            }
        }
    }
}
