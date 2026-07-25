//! θ, its standard error, and the pseudoword correction (BRIEF-010; the
//! standard-error model replaced in BRIEF-014 round 2; the θ update itself
//! replaced in BRIEF-014 round 3).
//!
//! `docs/engine-contract.md` §3 names `ThetaUpdated { theta, se }` as the
//! ability effect and reserves the band offsets in `tuning.toml` for this
//! module to spend. §4 defines the θ band the composer will one day select
//! against: `[θ + band_low, θ + band_high]`. §5 states the two properties
//! any implementation has to hold no matter how the arithmetic inside
//! changes: θ stays bounded, and its standard error never widens across a
//! session.
//!
//! **The standard error is derived from accumulated Fisher information, not
//! stored and decayed.** BRIEF-014's simulator found the original model —
//! `theta_se` multiplied by a fixed decay factor on every observation —
//! satisfies "non-increasing" trivially, by construction, regardless of how
//! informative any observation was, and reports a certainty (±0.00006 after
//! sixty draws) no sequence of Bernoulli observations could justify. The fix
//! is standard IRT: each real-word observation contributes
//! `p * (1 - p)` of Fisher information, `p` being [`response_probability`]'s
//! own expectation for that observation *before* θ moves — maximal (0.25)
//! when an item sits exactly at the learner's current ability, vanishing as
//! a claim becomes a foregone conclusion either way. Information only ever
//! grows; `theta_se` is `1 / sqrt(total_information)`, computed fresh on
//! every read from whatever total is current, never stored as a second
//! number that could disagree with it.
//!
//! **θ itself now moves by Fisher scoring, the same information the
//! standard error reads.** Round 2 fixed how uncertainty was *reported* and
//! left how θ *moved* alone: a fixed-size step (`theta_update_rate` times
//! the residual) toward each observation's residual, sized the same whether
//! it was the first observation or the fiftieth. BRIEF-014 round 3's
//! simulator found the two could not be reconciled — an estimate and its
//! reported uncertainty must come from one mechanism, or the uncertainty is
//! decoration. [`update_theta`] now divides the residual by the very total
//! `theta_se` is about to be derived from: a large step while accumulated
//! information is still thin, vanishing toward zero as it grows.
//! `theta_update_rate` bought nothing this scheme still needs and is
//! retired — from `tuning.toml`, from [`crate::tuning::Tuning`], and from
//! its range check.
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
/// reachable from [`crate::LearnerState`]. `LearnerState.theta` is what this
/// effect's `theta` describes the host having just written there, and `se`
/// describes what `LearnerState::theta_se` now reads back — derived from the
/// `theta_information` the host actually wrote, not a second stored field;
/// the effect itself is only ever the host's cue to persist and re-render
/// (engine-contract §3 — "effects are a description of what changed, not
/// commands").
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct ThetaUpdated {
    /// The learner's ability estimate after this observation.
    pub theta: f64,
    /// θ's standard error after this observation.
    pub se: f64,
}

/// What [`update_theta`] decided.
///
/// `theta` is always equal to `effect.theta`, and `effect.se` is always
/// `1 / sqrt(theta_information)` — exposed as its own field so a caller
/// writing `LearnerState`'s stored information does not have to reach into
/// the effect payload to get it (the same shape `scheduler::ScheduleDecision`
/// uses for `due` / `interval_days` against `IntervalSet`).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ThetaUpdate {
    /// The learner's ability estimate after this observation. Write this
    /// into `LearnerState.theta`.
    pub theta: f64,
    /// θ's accumulated Fisher information after this observation — always
    /// greater than the input, evidence only ever adds. Write this into
    /// `LearnerState`'s stored information
    /// (`LearnerState::set_theta_and_information`); `effect.se` is derived
    /// from this same number, not a second one to keep in sync.
    pub theta_information: f64,
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

/// Move θ and its accumulated Fisher information by one observation — one
/// `DeckSwipe`'s worth of evidence (engine-contract §3).
///
/// Pure (engine-contract §1): `theta`, `theta_information`, `difficulty`,
/// `knew`, `is_pseudoword`, and `tuning` are the whole input; nothing else is
/// read and nothing is mutated in place.
///
/// **Real words** (`is_pseudoword` false) move θ by Fisher scoring (Done
/// clause 2; BRIEF-014 round 3): the residual between the claim — `1.0` for
/// "knew", `0.0` otherwise — and [`response_probability`]'s expectation,
/// divided by the total accumulated Fisher information this same
/// observation is about to bring `theta_se` to (`sanitized_information +
/// this observation's own p * (1 - p)`) — the same total, not a second one,
/// so the step and the reported uncertainty can never disagree about how
/// much evidence has arrived. A correct claim on a hard item (high
/// `difficulty`, relative to `theta`) sits far below what the model already
/// expected, so its residual is larger than the same claim on an easy item,
/// whose expectation was already close to certain — that asymmetry is the
/// whole reason to run a response model instead of a running average (the
/// brief's own framing). Dividing by accumulated information adds a second
/// asymmetry, across time rather than difficulty: a learner's first
/// observation, with only `theta_prior_information` behind it, moves θ a
/// long way on the same residual that the fiftieth — with forty-nine
/// observations' worth of information already accumulated — moves it
/// hardly at all. The same expectation also *is* the observation's Fisher
/// information, `p * (1 - p)` — standard for a Bernoulli trial under a
/// logistic model, and maximal (0.25) exactly when the item was most
/// informative: at `p = 0.5`, an item pitched right at the learner's
/// current ability, where the answer was least predictable in advance.
///
/// **Pseudowords** (`is_pseudoword` true) do not exist, so there is no
/// difficulty for one to be evaluated against — `difficulty` is ignored on
/// this branch entirely, and so is the response model: there is no `p` to
/// compute a Fisher information from, so a pseudoword observation
/// contributes none. Claiming to know one (`knew` true) is over-claiming by
/// definition and steps θ down by `tuning.pseudoword_penalty` (Done clause
/// 5): folded into this same per-observation call rather than a second event
/// a caller could forget to send, so a session where a learner over-claims
/// on pseudowords accumulates the correction one observation at a time,
/// without this function or its caller ever having to compute a session-wide
/// claim rate. Honestly saying "don't know" to a pseudoword is the expected
/// response and moves θ by nothing — there is nothing to correct for and
/// nothing to reward, since a pseudoword carries no real vocabulary evidence
/// either way.
///
/// **θ is clamped last**, to `[tuning.theta_min, tuning.theta_max]`, with
/// `f64::max` then `f64::min` rather than a branch — both return their
/// non-`NaN` operand when the other one is `NaN` (the same idiom
/// `scheduler::schedule_encounter` uses to clamp `interval_days`), so a
/// `NaN` produced upstream by adversarial or corrupted input collapses to a
/// bound instead of propagating (Done clause 8: θ never becomes `NaN` or
/// infinite).
///
/// **Accumulated information only ever grows** (Done clause 4;
/// engine-contract §5's amendment), so the derived standard error is
/// non-increasing for the reason engine-contract §5 now states explicitly:
/// evidence arrived. `theta_information` is sanitized first — a `NaN`,
/// non-positive, or infinite input falls back to `tuning.theta_prior_information`
/// rather than to `0.0`: the old model's floor was the tightest a *stored*
/// standard error could legally be, but here `0.0` is the one value that
/// would make the *derived* standard error infinite, so the sanitized floor
/// is instead the same starting point a brand-new learner gets
/// (`LearnerState::new`, seeded from that same constant) — adversarial or
/// corrupted input is treated as "no evidence yet," never as "unlimited
/// evidence." The observation's own information (`0.0` for a pseudoword,
/// `p * (1 - p)` for a real word, both never negative) is added on top, and
/// `theta_se` is recomputed fresh from that new total — `1 / sqrt(total)` —
/// rather than decayed independently of it, so there is exactly one number
/// this function can disagree with itself about.
pub fn update_theta(
    theta: f64,
    theta_information: f64,
    difficulty: f64,
    knew: bool,
    is_pseudoword: bool,
    tuning: &Tuning,
) -> ThetaUpdate {
    let sanitized_information = if theta_information.is_finite() && theta_information > 0.0 {
        theta_information
    } else {
        tuning.theta_prior_information
    };

    let (delta, observation_information) = if is_pseudoword {
        let delta = if knew {
            -tuning.pseudoword_penalty
        } else {
            0.0
        };
        (delta, 0.0)
    } else {
        let claim = if knew { 1.0 } else { 0.0 };
        let expected = response_probability(theta, difficulty);
        let score = claim - expected;
        let information = (expected * (1.0 - expected)).max(0.0);
        // Fisher scoring: the step is the score divided by the total
        // information the observation itself is about to bring the
        // estimate to — the same total `theta_se` below is derived from,
        // never a second number that could disagree with it. Early on,
        // `sanitized_information` sits at (or near) `theta_prior_information`
        // and the step is large; by the fiftieth observation the
        // denominator has grown and the same-sized residual moves θ very
        // little. `sanitized_information` is always strictly positive
        // (the floor just above), so this division can never blow up from
        // a near-zero denominator.
        let delta = score / (sanitized_information + information);
        (delta, information)
    };

    let raw_theta = theta + delta;
    let new_theta = raw_theta.max(tuning.theta_min).min(tuning.theta_max);

    let new_information = sanitized_information + observation_information;
    let new_se = 1.0 / new_information.sqrt();

    let effect = ThetaUpdated {
        theta: new_theta,
        se: new_se,
    };

    ThetaUpdate {
        theta: new_theta,
        theta_information: new_information,
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
        let information = 1.0;

        let hard = update_theta(theta, information, theta + 3.0, true, false, &tuning);
        let easy = update_theta(theta, information, theta - 3.0, true, false, &tuning);

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

    /// BRIEF-014 round 3's whole point: Fisher scoring means the step for an
    /// *identical* residual shrinks as accumulated information grows, so an
    /// early observation moves θ further than a later one does, even with
    /// the same claim against the same difficulty (`docs/engine-contract.md`
    /// §5's amendment — "the estimate and its reported uncertainty must be
    /// produced by the same mechanism").
    #[test]
    fn a_correct_claim_moves_theta_less_once_more_information_has_accumulated() {
        let tuning = Tuning::default();
        let theta = 0.0;
        let difficulty = 0.0;

        let early = update_theta(
            theta,
            tuning.theta_prior_information,
            difficulty,
            true,
            false,
            &tuning,
        );
        let later = update_theta(theta, 50.0, difficulty, true, false, &tuning);

        let early_step = early.theta - theta;
        let later_step = later.theta - theta;

        assert!(
            early_step > 0.0 && later_step > 0.0,
            "a correct claim should move θ up regardless of how much information has \
             accumulated: early {early_step}, later {later_step}"
        );
        assert!(
            early_step > later_step,
            "the same claim against the same item should move θ less once more information \
             has accumulated: early {early_step}, later {later_step}"
        );
    }

    /// Fisher scoring's numerator and the derived standard error's
    /// denominator read the same accumulated-information total — the rule
    /// engine-contract §5's round-3 amendment states: an estimate and its
    /// reported uncertainty come from one mechanism, not two that could
    /// disagree.
    #[test]
    fn theta_step_and_the_derived_standard_error_read_the_same_accumulated_information() {
        let tuning = Tuning::default();
        let theta = 0.0;
        let starting_information = 3.0;

        let update = update_theta(theta, starting_information, 0.5, true, false, &tuning);

        let expected = response_probability(theta, 0.5);
        let observation_information = expected * (1.0 - expected);
        let total_information = starting_information + observation_information;
        let expected_step = (1.0 - expected) / total_information;

        assert!((update.theta - theta - expected_step).abs() < 1e-12);
        assert!((update.effect.se - 1.0 / total_information.sqrt()).abs() < 1e-12);
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
        let information = 1.0;
        let extremely_hard_difficulty = 1000.0;

        for step in 0..100 {
            let update = update_theta(
                theta,
                information,
                extremely_hard_difficulty,
                true,
                false,
                &tuning,
            );
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
        let information = 1.0;

        for step in 0..100 {
            let update = update_theta(theta, information, 0.0, true, true, &tuning);
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
        let mut overclaimer_information = 1.0;
        let mut honest_theta = 0.0;
        let mut honest_information = 1.0;

        for (difficulty, is_pseudoword) in items {
            // The over-claimer says "knew" to everything, real or not. The
            // honest learner says "knew" to every real word — identically to
            // the over-claimer — and "didn't know" to every pseudoword.
            let overclaimer_knew = true;
            let honest_knew = !is_pseudoword;

            let overclaimer_update = update_theta(
                overclaimer_theta,
                overclaimer_information,
                difficulty,
                overclaimer_knew,
                is_pseudoword,
                &tuning,
            );
            overclaimer_theta = overclaimer_update.theta;
            overclaimer_information = overclaimer_update.theta_information;

            let honest_update = update_theta(
                honest_theta,
                honest_information,
                difficulty,
                honest_knew,
                is_pseudoword,
                &tuning,
            );
            honest_theta = honest_update.theta;
            honest_information = honest_update.theta_information;
        }

        assert!(
            overclaimer_theta < honest_theta,
            "the over-claimer's θ ({overclaimer_theta}) should be strictly lower than the \
             honest learner's ({honest_theta})"
        );
    }

    /// Honestly rejecting a pseudoword is the expected response and moves θ
    /// by nothing. It also carries no Fisher information — a pseudoword has
    /// no response model to compute one from — so only the sanitize floor
    /// (shared by every observation) is what `theta_information` reflects.
    #[test]
    fn honest_pseudoword_rejection_does_not_move_theta() {
        let tuning = Tuning::default();
        let theta = 0.3;
        let information = 1.0;

        let update = update_theta(theta, information, 0.0, false, true, &tuning);

        assert_eq!(update.theta, theta);
        assert_eq!(update.theta_information, information);
    }

    /// Done clause 4 / engine-contract §5's amendment: accumulated
    /// information only ever grows, checked across both branches —
    /// pseudowords contribute `0.0` (still non-negative, so information
    /// never *falls*) and real words contribute `p * (1 - p)`, which is
    /// exactly zero only at the extremes and otherwise strictly positive.
    #[test]
    fn accumulated_information_never_decreases_on_either_branch() {
        let tuning = Tuning::default();
        let starting_information = 2.0;

        let real = update_theta(0.0, starting_information, 0.0, true, false, &tuning);
        assert!(real.theta_information >= starting_information);

        let pseudoword_claimed = update_theta(0.0, starting_information, 0.0, true, true, &tuning);
        assert_eq!(pseudoword_claimed.theta_information, starting_information);

        let pseudoword_rejected =
            update_theta(0.0, starting_information, 0.0, false, true, &tuning);
        assert_eq!(pseudoword_rejected.theta_information, starting_information);
    }

    /// The engine-contract §5 amendment's own worked number: an item pitched
    /// exactly at the learner's current ability (`difficulty == theta`) has
    /// response probability `0.5`, so its Fisher information is
    /// `0.5 * 0.5 == 0.25` — the maximum a single observation can contribute,
    /// added on top of whatever information the learner already carried.
    #[test]
    fn an_item_at_the_learners_own_ability_contributes_a_quarter_of_information() {
        let tuning = Tuning::default();
        let theta = 0.7;
        let starting_information = tuning.theta_prior_information;

        let update = update_theta(theta, starting_information, theta, true, false, &tuning);

        assert!(
            (update.theta_information - (starting_information + 0.25)).abs() < 1e-9,
            "expected information {}, got {}",
            starting_information + 0.25,
            update.theta_information
        );
    }

    /// Done clause 4 / engine-contract §5: a `theta_information` a caller
    /// could not legitimately have produced — `NaN`, negative, or zero —
    /// is sanitized to `tuning.theta_prior_information`, the same starting
    /// point a brand-new learner gets, never to `0.0` (which would make the
    /// derived standard error infinite before this call even adds its own
    /// observation).
    #[test]
    fn non_finite_or_non_positive_information_input_falls_back_to_the_prior_floor() {
        let tuning = Tuning::default();

        for adversarial in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, -1.0, 0.0] {
            // A pseudoword rejection contributes no observation information,
            // so the output is exactly the sanitized floor with nothing
            // added — the cleanest read of what the sanitize step alone did.
            let update = update_theta(0.0, adversarial, 0.0, false, true, &tuning);
            assert_eq!(
                update.theta_information, tuning.theta_prior_information,
                "adversarial input {adversarial} did not fall back to the prior floor"
            );
            assert!(update.effect.se.is_finite());
        }
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
                assert!(
                    update.effect.se.is_finite(),
                    "difficulty {difficulty}, knew {knew}: se was not finite"
                );
            }
        }
    }
}
