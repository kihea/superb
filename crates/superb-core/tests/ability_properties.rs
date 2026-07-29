//! Properties of θ's per-observation update (BRIEF-010, engine-contract §5).
//! The style matches `tests/scheduler_properties.rs`: an oracle-style helper
//! naming exactly what varies, and `proptest` sampling generated sequences of
//! observations rather than single calls.

use proptest::prelude::*;
use superb_core::tuning::Tuning;
use superb_core::update_theta;

/// One observation `update_theta` can be called with: an item's difficulty,
/// whether the learner claimed to know it, and whether the item was a
/// pseudoword.
fn observation_strategy() -> impl Strategy<Value = (f64, bool, bool)> {
    (-10.0..=10.0f64, any::<bool>(), any::<bool>())
}

proptest! {
    /// Engine-contract §5's amendment: accumulated Fisher information only
    /// ever grows, and the standard error derived from it — `1 /
    /// sqrt(information)` — is therefore non-increasing, for the reason the
    /// contract now states explicitly: evidence arrived. A generated-length
    /// sequence of generated observations, applied in order from a generated
    /// starting θ and information, with both bounds checked after *every*
    /// step rather than only the last — the same multi-step shape
    /// `scheduler_properties.rs`'s own sequence property uses.
    #[test]
    fn information_never_shrinks_and_standard_error_never_widens_over_any_generated_sequence(
        starting_theta in -4.0..=4.0f64,
        starting_information in 0.1..=5.0f64,
        observations in prop::collection::vec(observation_strategy(), 0..50),
    ) {
        let tuning = Tuning::default();
        let mut theta = starting_theta;
        let mut information = starting_information;
        let mut se = 1.0 / starting_information.sqrt();

        for (difficulty, knew, is_pseudoword) in observations {
            let update = update_theta(theta, information, difficulty, knew, is_pseudoword, &tuning);
            prop_assert!(
                update.theta_information >= information,
                "information shrank: {information} -> {}",
                update.theta_information
            );
            prop_assert!(
                update.theta_information > 0.0,
                "information was not strictly positive: {}",
                update.theta_information
            );
            prop_assert!(
                update.se() <= se + 1e-9,
                "se widened: {se} -> {}",
                update.se()
            );
            prop_assert!(update.se() >= 0.0, "se went negative: {}", update.se());
            theta = update.theta;
            information = update.theta_information;
            se = update.se();
        }
    }

    /// Done clause 8: θ never becomes `NaN` or infinite, for any generated
    /// sequence of claims — sampled broadly here; the three named shapes
    /// (all-correct, all-wrong, alternating) are covered explicitly below as
    /// concrete unit tests. `theta_information` and its derived `se` are
    /// sampled from a hostile starting value (`any::<f64>()`, including
    /// `NaN`, negative, and infinite) precisely to exercise
    /// `update_theta`'s sanitize-to-prior-floor step.
    #[test]
    fn theta_never_becomes_nan_or_infinite_over_any_generated_sequence(
        starting_theta in any::<f64>(),
        starting_information in any::<f64>(),
        observations in prop::collection::vec(observation_strategy(), 0..50),
    ) {
        let tuning = Tuning::default();
        let mut theta = starting_theta;
        let mut information = starting_information;

        for (difficulty, knew, is_pseudoword) in observations {
            let update = update_theta(theta, information, difficulty, knew, is_pseudoword, &tuning);
            prop_assert!(update.theta.is_finite(), "θ was not finite: {}", update.theta);
            prop_assert!(
                update.theta >= tuning.theta_min() && update.theta <= tuning.theta_max(),
                "θ {} left [{}, {}]",
                update.theta,
                tuning.theta_min(),
                tuning.theta_max()
            );
            prop_assert!(
                update.theta_information.is_finite() && update.theta_information > 0.0,
                "information was not finite and strictly positive: {}",
                update.theta_information
            );
            prop_assert!(
                update.se().is_finite(),
                "se was not finite: {}",
                update.se()
            );
            theta = update.theta;
            information = update.theta_information;
        }
    }

    /// Done clause 7: `band`'s width equals `band_high - band_low` for any
    /// θ, sampled broadly rather than at a handful of fixed points. The
    /// domain is generous around `[theta_min, theta_max]` rather than every
    /// `f64` — θ, by [`update_theta`]'s own clamp, never leaves that range in
    /// practice, and at astronomical magnitudes `theta + band_low` and
    /// `theta + band_high` round to the same `f64` by simple loss of
    /// precision, which is a fact about floating point at that scale, not
    /// about `band`'s arithmetic.
    #[test]
    fn band_width_is_constant_for_any_theta(theta in -1_000.0..=1_000.0f64) {
        let tuning = Tuning::default();
        let (low, high) = superb_core::band(theta, &tuning);
        prop_assert!((high - low - (tuning.band_high() - tuning.band_low())).abs() < 1e-9);
    }
}

/// A twenty-observation, all-correct real-word session at a middling
/// difficulty never produces a non-finite θ.
#[test]
fn all_correct_sequence_keeps_theta_finite() {
    let tuning = Tuning::default();
    let mut theta = 0.0;
    let mut information = 1.0;

    for _ in 0..20 {
        let update = update_theta(theta, information, 0.0, true, false, &tuning);
        assert!(update.theta.is_finite());
        theta = update.theta;
        information = update.theta_information;
    }
}

/// A twenty-observation, all-wrong real-word session never produces a
/// non-finite θ either — the symmetric case.
#[test]
fn all_wrong_sequence_keeps_theta_finite() {
    let tuning = Tuning::default();
    let mut theta = 0.0;
    let mut information = 1.0;

    for _ in 0..20 {
        let update = update_theta(theta, information, 0.0, false, false, &tuning);
        assert!(update.theta.is_finite());
        theta = update.theta;
        information = update.theta_information;
    }
}

/// A twenty-observation, alternating-claim real-word session never produces
/// a non-finite θ.
#[test]
fn alternating_sequence_keeps_theta_finite() {
    let tuning = Tuning::default();
    let mut theta = 0.0;
    let mut information = 1.0;

    for step in 0..20 {
        let knew = step % 2 == 0;
        let update = update_theta(theta, information, 0.0, knew, false, &tuning);
        assert!(update.theta.is_finite());
        theta = update.theta;
        information = update.theta_information;
    }
}
