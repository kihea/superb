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
    /// Engine-contract §5: "θ's standard error is non-increasing across a
    /// session." A generated-length sequence of generated observations,
    /// applied in order from a generated starting θ and se, with the bound
    /// checked after *every* step rather than only the last — the same
    /// multi-step shape `scheduler_properties.rs`'s own sequence property
    /// uses.
    #[test]
    fn standard_error_never_widens_over_any_generated_sequence(
        starting_theta in -4.0..=4.0f64,
        starting_se in 0.0..=5.0f64,
        observations in prop::collection::vec(observation_strategy(), 0..50),
    ) {
        let tuning = Tuning::default();
        let mut theta = starting_theta;
        let mut se = starting_se;

        for (difficulty, knew, is_pseudoword) in observations {
            let update = update_theta(theta, se, difficulty, knew, is_pseudoword, &tuning);
            prop_assert!(
                update.theta_se <= se,
                "se widened: {se} -> {}",
                update.theta_se
            );
            prop_assert!(update.theta_se >= 0.0, "se went negative: {}", update.theta_se);
            theta = update.theta;
            se = update.theta_se;
        }
    }

    /// Done clause 8: θ never becomes `NaN` or infinite, for any generated
    /// sequence of claims — sampled broadly here; the three named shapes
    /// (all-correct, all-wrong, alternating) are covered explicitly below as
    /// concrete unit tests.
    #[test]
    fn theta_never_becomes_nan_or_infinite_over_any_generated_sequence(
        starting_theta in any::<f64>(),
        starting_se in any::<f64>(),
        observations in prop::collection::vec(observation_strategy(), 0..50),
    ) {
        let tuning = Tuning::default();
        let mut theta = starting_theta;
        let mut se = starting_se;

        for (difficulty, knew, is_pseudoword) in observations {
            let update = update_theta(theta, se, difficulty, knew, is_pseudoword, &tuning);
            prop_assert!(update.theta.is_finite(), "θ was not finite: {}", update.theta);
            prop_assert!(
                update.theta >= tuning.theta_min && update.theta <= tuning.theta_max,
                "θ {} left [{}, {}]",
                update.theta,
                tuning.theta_min,
                tuning.theta_max
            );
            prop_assert!(update.theta_se.is_finite(), "se was not finite: {}", update.theta_se);
            theta = update.theta;
            se = update.theta_se;
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
        prop_assert!((high - low - (tuning.band_high - tuning.band_low)).abs() < 1e-9);
    }
}

/// A twenty-observation, all-correct real-word session at a middling
/// difficulty never produces a non-finite θ.
#[test]
fn all_correct_sequence_keeps_theta_finite() {
    let tuning = Tuning::default();
    let mut theta = 0.0;
    let mut se = 1.0;

    for _ in 0..20 {
        let update = update_theta(theta, se, 0.0, true, false, &tuning);
        assert!(update.theta.is_finite());
        theta = update.theta;
        se = update.theta_se;
    }
}

/// A twenty-observation, all-wrong real-word session never produces a
/// non-finite θ either — the symmetric case.
#[test]
fn all_wrong_sequence_keeps_theta_finite() {
    let tuning = Tuning::default();
    let mut theta = 0.0;
    let mut se = 1.0;

    for _ in 0..20 {
        let update = update_theta(theta, se, 0.0, false, false, &tuning);
        assert!(update.theta.is_finite());
        theta = update.theta;
        se = update.theta_se;
    }
}

/// A twenty-observation, alternating-claim real-word session never produces
/// a non-finite θ.
#[test]
fn alternating_sequence_keeps_theta_finite() {
    let tuning = Tuning::default();
    let mut theta = 0.0;
    let mut se = 1.0;

    for step in 0..20 {
        let knew = step % 2 == 0;
        let update = update_theta(theta, se, 0.0, knew, false, &tuning);
        assert!(update.theta.is_finite());
        theta = update.theta;
        se = update.theta_se;
    }
}
