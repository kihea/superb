//! Properties of the scheduler's interval arithmetic (BRIEF-009,
//! engine-contract §5). The style matches `tests/state_properties.rs`: an
//! oracle-style helper naming exactly what varies, exhaustive iteration
//! where the domain is small (`WordState`'s five variants), and `proptest`
//! sampling everything else.

use std::collections::BTreeMap;

use proptest::prelude::*;
use superb_core::state::WordState;
use superb_core::tuning::Tuning;
use superb_core::{EncounterOutcome, LearnerState, Timestamp, WordRecord, schedule_encounter};

const STATES: [WordState; 5] = [
    WordState::Unseen,
    WordState::Seeded,
    WordState::Learning,
    WordState::Consolidating,
    WordState::Automatic,
];

/// A learner with exactly one word, `"w"`, in `state`, carrying
/// `interval_days` (or `None`, for "never scheduled") and due at
/// `due_millis`.
fn learner_with_word(
    state: WordState,
    interval_days: Option<f64>,
    due_millis: u64,
) -> LearnerState {
    let mut words = BTreeMap::new();
    words.insert(
        "w".to_string(),
        WordRecord::new(
            state,
            Timestamp::from_millis_since_epoch(due_millis),
            1,
            Vec::new(),
            interval_days,
        ),
    );
    LearnerState::new(0, 0, 0.0, 1.0, words, BTreeMap::new())
}

/// A valid, in-range interval — the domain the "never shortens" and
/// "always shortens" properties are stated over. Bounds come from the
/// shipped tuning rather than being restated as literals, so a future edit
/// to `tuning.toml`'s `interval_initial_days` or `interval_max_days` cannot
/// make this strategy quietly sample outside the range the code itself now
/// enforces.
fn valid_interval_days_strategy() -> impl Strategy<Value = f64> {
    let tuning = Tuning::default();
    tuning.interval_initial_days..=tuning.interval_max_days
}

proptest! {
    /// Engine-contract §5: "a clean pass never shortens an interval."
    /// Exhaustive over the five `WordState` variants (`state_index`, mapped
    /// through `STATES`); sampled over the interval a clean pass starts
    /// from and the due/now timestamps. The timestamps do not affect the
    /// interval arithmetic, but are varied anyway so a hidden dependency on
    /// either would show up as a failure rather than staying invisible.
    #[test]
    fn clean_pass_never_shortens_an_interval(
        state_index in 0usize..5,
        previous_interval_days in valid_interval_days_strategy(),
        due_millis in any::<u64>(),
        now_millis in any::<u64>(),
    ) {
        let tuning = Tuning::default();
        let state = STATES[state_index];
        let learner = learner_with_word(state, Some(previous_interval_days), due_millis);
        let now = Timestamp::from_millis_since_epoch(now_millis);

        let decision = schedule_encounter(&learner, "w", EncounterOutcome::Clean, now, &tuning);

        prop_assert!(
            decision.interval_days >= previous_interval_days,
            "state {state:?}: {previous_interval_days} widened to {}",
            decision.interval_days
        );
    }

    /// Engine-contract §5: "a gloss-tap always shortens one." Exhaustive
    /// over `WordState` for the same reason as above — the lapse multiplier
    /// does not depend on state, but nothing about that should be assumed
    /// by the test rather than checked. Strict once there is room to lose
    /// ground; held exactly at `interval_initial_days` once there is none,
    /// per Done clause 3's floor — a lapsed word is not an unknown word, so
    /// the interval can only fall so far.
    #[test]
    fn gloss_tap_always_shortens_or_holds_at_the_floor(
        state_index in 0usize..5,
        previous_interval_days in valid_interval_days_strategy(),
        due_millis in any::<u64>(),
        now_millis in any::<u64>(),
    ) {
        let tuning = Tuning::default();
        let state = STATES[state_index];
        let learner = learner_with_word(state, Some(previous_interval_days), due_millis);
        let now = Timestamp::from_millis_since_epoch(now_millis);

        let decision = schedule_encounter(&learner, "w", EncounterOutcome::GlossTap, now, &tuning);

        prop_assert!(decision.interval_days <= previous_interval_days);
        if previous_interval_days > tuning.interval_initial_days {
            prop_assert!(
                decision.interval_days < previous_interval_days,
                "state {state:?}: {previous_interval_days} should have shortened, got {}",
                decision.interval_days
            );
        } else {
            prop_assert_eq!(decision.interval_days, tuning.interval_initial_days);
        }
    }

    /// Engine-contract §5's bounds property, over adversarial input on
    /// purpose: a stored interval that is `None` (a word with a record but
    /// no interval yet), negative, zero, `NaN`, infinite, or already past
    /// the ceiling; a due date and a `now` in either order, including `now`
    /// before the word's stored due date (met again early); either
    /// encounter outcome. Whatever arrives, the result must be positive,
    /// finite, and never above `interval_max_days`.
    #[test]
    fn interval_is_never_negative_zero_or_above_the_ceiling(
        state_index in 0usize..5,
        stored_interval_days in prop_oneof![
            Just(None),
            any::<f64>().prop_map(Some),
        ],
        due_millis in any::<u64>(),
        now_millis in any::<u64>(),
        outcome_is_clean in any::<bool>(),
    ) {
        let tuning = Tuning::default();
        let state = STATES[state_index];
        let learner = learner_with_word(state, stored_interval_days, due_millis);
        let now = Timestamp::from_millis_since_epoch(now_millis);
        let outcome = if outcome_is_clean {
            EncounterOutcome::Clean
        } else {
            EncounterOutcome::GlossTap
        };

        let decision = schedule_encounter(&learner, "w", outcome, now, &tuning);

        prop_assert!(
            decision.interval_days > 0.0,
            "interval was not positive: {}",
            decision.interval_days
        );
        prop_assert!(decision.interval_days.is_finite());
        prop_assert!(
            decision.interval_days <= tuning.interval_max_days,
            "interval exceeded the ceiling: {}",
            decision.interval_days
        );
    }

    /// The same bounds property for a word entirely absent from
    /// `learner.words` — "a word never seen" named explicitly in the
    /// brief's Verifier section, distinct from a word with a record but no
    /// stored interval.
    #[test]
    fn interval_is_sane_for_a_word_with_no_record_at_all(
        now_millis in any::<u64>(),
        outcome_is_clean in any::<bool>(),
    ) {
        let tuning = Tuning::default();
        let learner = LearnerState::new(0, 0, 0.0, 1.0, BTreeMap::new(), BTreeMap::new());
        let now = Timestamp::from_millis_since_epoch(now_millis);
        let outcome = if outcome_is_clean {
            EncounterOutcome::Clean
        } else {
            EncounterOutcome::GlossTap
        };

        let decision = schedule_encounter(&learner, "never-met", outcome, now, &tuning);

        prop_assert!(decision.interval_days > 0.0);
        prop_assert!(decision.interval_days.is_finite());
        prop_assert!(decision.interval_days <= tuning.interval_max_days);
    }

    /// The ARCHITECT'S ANSWER's range-invariant bullet, read literally: "a
    /// property test asserts the invariant holds after any generated
    /// sequence of outcomes." The four properties above are all single-step
    /// — each draws one starting interval and asserts the bound after
    /// exactly one call to `schedule_encounter`. This one is the missing
    /// multi-step artifact BRIEF-009's review (finding F2) named: a
    /// generated-length sequence of generated outcomes, applied in order
    /// from a generated starting state, with the bound checked after
    /// *every* step rather than only the last. The single-step property
    /// holding for any input implies this inductively, but an implication is
    /// not the test the architect asked for — this is that test.
    #[test]
    fn interval_stays_in_range_after_any_generated_sequence_of_outcomes(
        state_index in 0usize..5,
        starting_interval_days in prop_oneof![
            Just(None),
            valid_interval_days_strategy().prop_map(Some),
        ],
        starting_due_millis in any::<u64>(),
        starting_now_millis in any::<u64>(),
        outcomes in prop::collection::vec(any::<bool>(), 1..30),
    ) {
        let tuning = Tuning::default();
        let state = STATES[state_index];
        let mut learner = learner_with_word(state, starting_interval_days, starting_due_millis);
        let mut now = Timestamp::from_millis_since_epoch(starting_now_millis);

        for outcome_is_clean in outcomes {
            let outcome = if outcome_is_clean {
                EncounterOutcome::Clean
            } else {
                EncounterOutcome::GlossTap
            };

            let decision = schedule_encounter(&learner, "w", outcome, now, &tuning);

            prop_assert!(
                decision.interval_days > 0.0,
                "interval was not positive: {}",
                decision.interval_days
            );
            prop_assert!(
                !decision.interval_days.is_nan(),
                "interval was NaN"
            );
            prop_assert!(
                decision.interval_days.is_finite(),
                "interval was not finite: {}",
                decision.interval_days
            );
            prop_assert!(
                decision.interval_days <= tuning.interval_max_days,
                "interval exceeded the ceiling: {}",
                decision.interval_days
            );

            let record = learner.words.get_mut("w").expect("word exists");
            record.set_due_and_interval(decision.due, decision.interval_days);
            now = decision.due;
        }
    }
}
