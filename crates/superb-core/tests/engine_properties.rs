//! Determinism, asserted rather than assumed (this brief's own Done
//! clause). Purity laws 1 and 2 (engine-contract §1) exist to buy
//! byte-identical replay; nothing built before this brief has ever checked
//! that the buy actually happened. Four properties, in the order the
//! brief's own Verifier names them:
//!
//! 1. The same event sequence, run twice from the same starting
//!    `LearnerState`, `now`, and `Tuning`, produces the same effects every
//!    time.
//! 2. The same property again, starting from a state round-tripped through
//!    JSON rather than a plain clone.
//! 3. The same sequence, re-batched across a different split of `decide`
//!    calls, ends at the same `LearnerState` and the same concatenated
//!    effects — the Verifier's "two different but equivalent batchings."
//! 4. A `(Needs, Frame)` pair captured, serialized, and deserialized
//!    replays to the same `Outcome` — engine-contract §2's promised
//!    debugging surface, checked rather than taken on faith.

use std::collections::BTreeMap;

use proptest::prelude::*;
use superb_core::engine::{self, Frame, Outcome, Request};
use superb_core::signals::Event;
use superb_core::state::WordState;
use superb_core::{ContextEncounter, LearnerState, Timestamp, Tuning, WordRecord};

fn word_id_strategy() -> impl Strategy<Value = String> {
    "[a-z][a-z0-9-]{0,10}"
}

fn word_state_strategy() -> impl Strategy<Value = WordState> {
    prop_oneof![
        Just(WordState::Unseen),
        Just(WordState::Seeded),
        Just(WordState::Learning),
        Just(WordState::Consolidating),
        Just(WordState::Automatic),
    ]
}

fn interval_days_strategy() -> impl Strategy<Value = Option<f64>> {
    prop_oneof![Just(None), (0.5..200.0f64).prop_map(Some)]
}

fn context_encounter_strategy() -> impl Strategy<Value = ContextEncounter> {
    (word_id_strategy(), any::<bool>())
        .prop_map(|(frame_id, clean)| ContextEncounter { frame_id, clean })
}

fn word_record_strategy() -> impl Strategy<Value = WordRecord> {
    (
        word_state_strategy(),
        any::<u64>(),
        prop::collection::vec(context_encounter_strategy(), 0..3),
        interval_days_strategy(),
    )
        .prop_map(|(state, due_millis, context_frames, interval_days)| {
            WordRecord::new(
                state,
                Timestamp::from_millis_since_epoch(due_millis),
                context_frames,
                interval_days,
            )
        })
}

/// A `LearnerState` sampled broadly — seed, draw count, θ, its accumulated
/// information, and up to four words in arbitrary states — so a hidden
/// dependency on any of them would show up as a failure rather than
/// staying invisible.
fn learner_state_strategy() -> impl Strategy<Value = LearnerState> {
    (
        any::<u64>(),
        any::<u64>(),
        -3.0..3.0f64,
        0.0..2.0f64,
        prop::collection::btree_map(word_id_strategy(), word_record_strategy(), 0..4),
        prop::collection::btree_map(word_id_strategy(), -2.0..2.0f64, 0..3),
    )
        .prop_map(
            |(seed, draw_count, theta, theta_information, words, topic_affinities)| {
                LearnerState::new(
                    seed,
                    draw_count,
                    theta,
                    theta_information,
                    words,
                    topic_affinities,
                )
            },
        )
}

fn event_strategy() -> impl Strategy<Value = Event> {
    prop_oneof![
        (word_id_strategy(), any::<bool>(), any::<bool>()).prop_map(
            |(item_id, is_pseudoword, knew)| Event::DeckSwipe {
                item_id,
                is_pseudoword,
                knew,
            }
        ),
        (word_id_strategy(), word_id_strategy(), any::<u32>()).prop_map(
            |(word, passage, position)| Event::GlossTap {
                word,
                passage,
                position,
            }
        ),
        (word_id_strategy(), any::<bool>(), 1u32..5).prop_map(|(word, assembled, attempts)| {
            Event::ProbeResult {
                word,
                assembled,
                attempts,
            }
        }),
        (
            word_id_strategy(),
            prop::collection::vec(word_id_strategy(), 0..3),
            any::<u64>(),
        )
            .prop_map(|(screen_id, words_on_screen, ms)| Event::ScreenDwell {
                screen_id,
                words_on_screen,
                ms,
            }),
        (
            word_id_strategy(),
            prop::collection::vec(word_id_strategy(), 0..4),
        )
            .prop_map(|(passage, words_seen)| Event::PassageFinished {
                passage,
                words_seen
            }),
        (
            word_id_strategy(),
            prop::collection::vec(word_id_strategy(), 0..4),
        )
            .prop_map(|(passage, words_seen)| Event::PassageAbandoned {
                passage,
                words_seen
            }),
    ]
}

fn frame_strategy() -> impl Strategy<Value = Frame> {
    prop_oneof![
        Just(Frame::Nothing),
        (-4.0..4.0f64).prop_map(|difficulty| Frame::ItemDifficulty { difficulty }),
    ]
}

/// Run every `(event, frame)` step against `learner` in order, mutating it
/// in place, and return the `Outcome` each step produced.
fn run_all(
    learner: &mut LearnerState,
    now: Timestamp,
    tuning: &Tuning,
    steps: &[(Event, Frame)],
) -> Vec<Outcome> {
    steps
        .iter()
        .map(|(event, frame)| {
            let request = Request::ProcessEvent(event.clone());
            engine::decide(learner, request, frame.clone(), now, tuning)
        })
        .collect()
}

proptest! {
    /// The brief's headline property: the same event sequence, from the
    /// same starting state, `now`, and `Tuning`, produces the same effects
    /// every time. Purity laws 1 and 2 exist to buy this; this is the check
    /// that the buy actually happened.
    #[test]
    fn same_event_sequence_from_the_same_start_produces_the_same_outcomes(
        learner in learner_state_strategy(),
        now_millis in any::<u64>(),
        steps in prop::collection::vec((event_strategy(), frame_strategy()), 1..6),
    ) {
        let tuning = Tuning::default();
        let now = Timestamp::from_millis_since_epoch(now_millis);

        let mut first = learner.clone();
        let first_outcomes = run_all(&mut first, now, &tuning, &steps);

        let mut second = learner.clone();
        let second_outcomes = run_all(&mut second, now, &tuning, &steps);

        prop_assert_eq!(first_outcomes, second_outcomes);
        prop_assert_eq!(first, second);
    }

    /// The same headline property, attacked the way the brief's own
    /// Verifier names specifically: from a state round-tripped through
    /// JSON (`LearnerState::to_document` / `::load`) rather than a plain
    /// in-memory clone. Nothing about serialization may be part of what
    /// `decide` reads — if it were, this is where it would show up.
    #[test]
    fn same_event_sequence_from_a_json_round_tripped_state_produces_the_same_outcomes(
        learner in learner_state_strategy(),
        now_millis in any::<u64>(),
        steps in prop::collection::vec((event_strategy(), frame_strategy()), 1..6),
    ) {
        let tuning = Tuning::default();
        let now = Timestamp::from_millis_since_epoch(now_millis);

        let mut plain = learner.clone();
        let plain_outcomes = run_all(&mut plain, now, &tuning, &steps);

        let mut round_tripped = LearnerState::load(&learner.to_document())
            .expect("a document this crate just wrote always loads");
        let round_tripped_outcomes = run_all(&mut round_tripped, now, &tuning, &steps);

        prop_assert_eq!(plain_outcomes, round_tripped_outcomes);
        prop_assert_eq!(plain, round_tripped);
    }

    /// The Verifier's "two different but equivalent batchings": the same
    /// sequence of `decide` calls, split at a different point into two
    /// runs of `run_all` instead of one, ends at the same `LearnerState`
    /// and produces the same effects, concatenated. `decide` carries no
    /// state across calls except `LearnerState` itself, so nothing about
    /// where a host happens to chunk its own calling loop may be visible
    /// in the result.
    #[test]
    fn rebatching_the_same_calls_differently_does_not_change_the_result(
        learner in learner_state_strategy(),
        now_millis in any::<u64>(),
        steps in prop::collection::vec((event_strategy(), frame_strategy()), 2..6),
        split_seed in any::<u8>(),
    ) {
        let tuning = Tuning::default();
        let now = Timestamp::from_millis_since_epoch(now_millis);
        let split = (split_seed as usize % (steps.len() - 1)) + 1;

        let mut whole = learner.clone();
        let whole_outcomes = run_all(&mut whole, now, &tuning, &steps);

        let mut split_state = learner.clone();
        let mut split_outcomes = run_all(&mut split_state, now, &tuning, &steps[..split]);
        split_outcomes.extend(run_all(&mut split_state, now, &tuning, &steps[split..]));

        prop_assert_eq!(whole_outcomes, split_outcomes);
        prop_assert_eq!(whole, split_state);
    }
}

/// engine-contract §2's promised debugging surface: "any decision can be
/// replayed from a captured pair." A `(Needs, Frame)` pair is serialized,
/// deserialized, and fed back through `decide` — the result must be the
/// same `Outcome` an unserialized `Frame` would have produced. This is free
/// only if it is true; this is the test that it is.
#[test]
fn replaying_a_captured_needs_frame_pair_produces_the_same_outcome() {
    let tuning = Tuning::default();
    let mut words = BTreeMap::new();
    words.insert(
        "aperture".to_string(),
        WordRecord::new(
            WordState::Seeded,
            Timestamp::from_millis_since_epoch(0),
            Vec::new(),
            None,
        ),
    );
    let learner = LearnerState::new(7, 3, 0.1, 0.9, words, BTreeMap::new());
    let now = Timestamp::from_millis_since_epoch(1_000);
    let request = Request::ProcessEvent(Event::DeckSwipe {
        item_id: "aperture".to_string(),
        is_pseudoword: false,
        knew: true,
    });

    let needs = engine::plan(&learner, &request, now, &tuning);
    let frame = Frame::ItemDifficulty { difficulty: 0.4 };

    // Capture, exactly as a host debugging a production decision would:
    // serialize both halves, then deserialize them back.
    let needs_json = serde_json::to_string(&needs).expect("Needs serializes");
    let frame_json = serde_json::to_string(&frame).expect("Frame serializes");
    let replayed_needs: superb_core::engine::Needs =
        serde_json::from_str(&needs_json).expect("Needs deserializes");
    let replayed_frame: Frame = serde_json::from_str(&frame_json).expect("Frame deserializes");
    assert_eq!(replayed_needs, needs, "Needs must round-trip unchanged");

    let mut original_path = learner.clone();
    let outcome_from_original =
        engine::decide(&mut original_path, request.clone(), frame, now, &tuning);

    let mut replayed_path = learner.clone();
    let outcome_from_replay =
        engine::decide(&mut replayed_path, request, replayed_frame, now, &tuning);

    assert_eq!(
        outcome_from_replay, outcome_from_original,
        "replaying a serialized (Needs, Frame) pair must reproduce the same Outcome"
    );
    assert_eq!(replayed_path, original_path);
}
