//! Properties of the word state machine.
//!
//! The table is restated here on purpose. A test that imports the
//! implementation's own table checks that the code agrees with itself; this one
//! checks that the code agrees with the brief.

use proptest::prelude::*;
use superb_core::state::{Transition, WordState};

const STATES: [WordState; 5] = [
    WordState::Unseen,
    WordState::Seeded,
    WordState::Learning,
    WordState::Consolidating,
    WordState::Automatic,
];

const TRANSITIONS: [Transition; 5] = [
    Transition::Seeded,
    Transition::LearningBegun,
    Transition::Consolidated,
    Transition::Automated,
    Transition::Lapsed,
];

/// The oracle: the transition table exactly as BRIEF-001 tables it.
fn expected(from: WordState, transition: Transition) -> Option<WordState> {
    match (from, transition) {
        (WordState::Unseen, Transition::Seeded) => Some(WordState::Seeded),
        (WordState::Seeded, Transition::LearningBegun) => Some(WordState::Learning),
        (WordState::Learning, Transition::Consolidated) => Some(WordState::Consolidating),
        (WordState::Consolidating, Transition::Automated) => Some(WordState::Automatic),
        (WordState::Consolidating | WordState::Automatic, Transition::Lapsed) => {
            Some(WordState::Learning)
        }
        _ => None,
    }
}

/// Every pair the table names, and every pair it does not, behaves as tabled.
#[test]
fn the_table_is_the_behaviour() {
    for from in STATES {
        for transition in TRANSITIONS {
            match (from.apply(transition), expected(from, transition)) {
                (Ok(change), Some(to)) => assert_eq!(change.to(), to, "{from:?} + {transition:?}"),
                (Err(_), None) => {}
                (got, want) => panic!("{from:?} + {transition:?}: got {got:?}, wanted {want:?}"),
            }
        }
    }
}

/// An effect always means something moved. Without this, a no-op could be
/// persisted as a change and the event log would claim progress that never
/// happened.
#[test]
fn every_legal_transition_changes_state() {
    for from in STATES {
        for transition in TRANSITIONS {
            if let Ok(change) = from.apply(transition) {
                assert_ne!(change.from(), change.to(), "{from:?} + {transition:?}");
            }
        }
    }
}

/// Up is one step at a time. A word cannot be promoted from Seeded to
/// Automatic by any single event, which is what makes the encounter count
/// meaningful rather than nominal.
#[test]
fn forward_transitions_advance_exactly_one_rank() {
    for from in STATES {
        for transition in TRANSITIONS {
            if transition == Transition::Lapsed {
                continue;
            }
            if let Ok(change) = from.apply(transition) {
                assert_eq!(
                    change.to().rank(),
                    change.from().rank() + 1,
                    "{from:?} + {transition:?}"
                );
            }
        }
    }
}

/// The only edge downward, and it always lands in the same place. A lapse from
/// Automatic does not drop a word to Unseen and make it learn from nothing.
#[test]
fn lapse_lands_in_learning_from_the_late_states_only() {
    for from in STATES {
        let result = from.apply(Transition::Lapsed);
        match from {
            WordState::Consolidating | WordState::Automatic => {
                assert_eq!(
                    result.expect("lapse is legal here").to(),
                    WordState::Learning
                );
            }
            _ => assert!(result.is_err(), "lapse should be refused from {from:?}"),
        }
    }
}

/// Serialization is a public contract: these strings are in golden vectors and
/// cross three FFI boundaries, so the spelling is asserted literally rather
/// than round-tripped only.
#[test]
fn word_state_serde_roundtrips_as_its_screaming_snake_name() {
    let cases = [
        (WordState::Unseen, "\"UNSEEN\""),
        (WordState::Seeded, "\"SEEDED\""),
        (WordState::Learning, "\"LEARNING\""),
        (WordState::Consolidating, "\"CONSOLIDATING\""),
        (WordState::Automatic, "\"AUTOMATIC\""),
    ];

    for (state, json) in cases {
        assert_eq!(serde_json::to_string(&state).unwrap(), json);
        assert_eq!(
            serde_json::from_str::<WordState>(json).unwrap(),
            state,
            "round trip"
        );
    }
}

proptest! {
    /// A refusal reports what was actually asked, so a scheduler bug is
    /// diagnosable from the error alone.
    #[test]
    fn illegal_transitions_produce_no_change(s in 0usize..5, t in 0usize..5) {
        let from = STATES[s];
        let transition = TRANSITIONS[t];
        prop_assume!(expected(from, transition).is_none());

        let error = from.apply(transition).expect_err("should be refused");
        prop_assert_eq!(error.from, from);
        prop_assert_eq!(error.transition, transition);
    }

    /// No sequence of events, however unlikely, skips a state on the way up.
    /// This is the reachability claim in engine-contract §5, stated over
    /// arbitrary streams rather than over the ones we thought to write.
    #[test]
    fn automatic_is_reachable_only_through_every_earlier_state(
        stream in prop::collection::vec(0usize..5, 0..64)
    ) {
        let mut state = WordState::Unseen;
        let mut visited = [true, false, false, false, false];

        for index in stream {
            if let Ok(change) = state.apply(TRANSITIONS[index]) {
                let advanced = change.to().rank() as i16 - change.from().rank() as i16;
                prop_assert!(advanced <= 1, "advanced {} ranks", advanced);
                state = change.to();
                visited[state.rank() as usize] = true;
            }
        }

        if state == WordState::Automatic {
            prop_assert!(visited.iter().all(|seen| *seen), "reached the end early");
        }
    }
}
