//! `LearnerState`'s envelope: the two-pass load, totality over versions,
//! unknown-fields-inside-a-known-version, and content this build has never
//! heard of surviving a round trip (ADR-016, ADR-016's ADR-018-D5 amendment).
//!
//! One test per clause in BRIEF-008's Verifier section: a truncated
//! document, `v` as a string, `v` absent, a valid `v` with a wrong-shaped
//! payload, an unknown field nested three levels deep, and an unknown
//! context frame id. Each must produce a typed error or a faithful round
//! trip — never a panic and never a silent drop.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use proptest::prelude::*;
use superb_core::state::WordState;
use superb_core::{LearnerState, LoadError, Timestamp, WordRecord};

fn sample_state() -> LearnerState {
    let mut words = BTreeMap::new();
    words.insert(
        "aperture".to_string(),
        WordRecord::new(
            WordState::Seeded,
            Timestamp::from_millis_since_epoch(1_735_689_600_000),
            1,
            vec!["passage-042".to_string()],
            Some(1.0),
        ),
    );
    words.insert(
        "verisimilitude".to_string(),
        WordRecord::new(
            WordState::Consolidating,
            Timestamp::from_millis_since_epoch(1_738_368_000_000),
            9,
            vec![
                "excerpt-poe-1839-cask".to_string(),
                "excerpt-withdrawn-687".to_string(),
            ],
            Some(45.0),
        ),
    );

    let mut topic_affinities = BTreeMap::new();
    topic_affinities.insert("nature".to_string(), 0.62);
    topic_affinities.insert("cooking".to_string(), -0.1);

    LearnerState {
        seed: 20_260_722,
        draw_count: 214,
        theta: 0.35,
        theta_se: 0.18,
        words,
        topic_affinities,
    }
}

// --- Two-pass load: the probe works even when the payload does not ---

/// The probe reads `v` before the payload has to parse — a document whose
/// payload is unparseable garbage still tells `load` which version it is,
/// which is exactly why the error is `Malformed` (a known version, a bad
/// payload) and not `UnknownVersion`.
#[test]
fn probe_reads_the_version_even_when_the_payload_is_unparseable_garbage() {
    let garbage = r#"{"v": 1, "seed": "not-a-number", "draw_count": [1,2,3], "theta": {}}"#;

    match LearnerState::load(garbage) {
        Err(LoadError::Malformed { version, .. }) => assert_eq!(version, 1),
        other => panic!("expected Malformed{{version: 1, ..}}, got {other:?}"),
    }
}

/// ADR-016 Decision 2: the loader is total over versions. An unrecognised
/// `v` is a typed error carrying the number it saw, never a panic.
#[test]
fn unknown_version_is_a_typed_error_carrying_the_number() {
    let document = r#"{"v": 999, "seed": 1, "draw_count": 0, "theta": 0.0, "theta_se": 1.0, "words": {}, "topic_affinities": {}}"#;

    assert_eq!(
        LearnerState::load(document),
        Err(LoadError::UnknownVersion(999))
    );
}

// --- Every clause the Verifier section names ---

#[test]
fn truncated_document_is_a_typed_error_not_a_panic() {
    let truncated = r#"{"v": 1, "seed": 1, "draw_count"#;

    match LearnerState::load(truncated) {
        Err(LoadError::NotJson(_)) => {}
        other => panic!("expected NotJson, got {other:?}"),
    }
}

#[test]
fn version_as_a_string_is_a_typed_error() {
    let document = r#"{"v": "1", "seed": 1, "draw_count": 0, "theta": 0.0, "theta_se": 1.0, "words": {}, "topic_affinities": {}}"#;

    assert_eq!(
        LearnerState::load(document),
        Err(LoadError::VersionNotAnInteger)
    );
}

#[test]
fn version_absent_is_a_typed_error() {
    let document = r#"{"seed": 1, "draw_count": 0, "theta": 0.0, "theta_se": 1.0, "words": {}, "topic_affinities": {}}"#;

    assert_eq!(LearnerState::load(document), Err(LoadError::MissingVersion));
}

#[test]
fn non_object_top_level_is_a_typed_error_not_a_panic() {
    assert_eq!(
        LearnerState::load("[1, 2, 3]"),
        Err(LoadError::MissingVersion)
    );
    assert_eq!(
        LearnerState::load("\"just a string\""),
        Err(LoadError::MissingVersion)
    );
    match LearnerState::load("") {
        Err(LoadError::NotJson(_)) => {}
        other => panic!("expected NotJson, got {other:?}"),
    }
}

#[test]
fn valid_version_with_wrong_shaped_payload_is_a_typed_error() {
    // `theta` is a string where the schema expects a number: the version
    // probes fine, and the payload fails to match v1's shape.
    let document = r#"{"v": 1, "seed": 1, "draw_count": 0, "theta": "not a number", "theta_se": 1.0, "words": {}, "topic_affinities": {}}"#;

    match LearnerState::load(document) {
        Err(LoadError::Malformed { version, .. }) => assert_eq!(version, 1),
        other => panic!("expected Malformed{{version: 1, ..}}, got {other:?}"),
    }
}

/// An unknown field at the top level of a known version is an error, not
/// ignored (ADR-016 Decision 2).
#[test]
fn unknown_field_at_the_top_level_is_a_typed_error() {
    let document = r#"{"v": 1, "seed": 1, "draw_count": 0, "theta": 0.0, "theta_se": 1.0, "words": {}, "topic_affinities": {}, "extra_top_level_field": true}"#;

    match LearnerState::load(document) {
        Err(LoadError::Malformed { version, .. }) => assert_eq!(version, 1),
        other => panic!("expected Malformed{{version: 1, ..}}, got {other:?}"),
    }
}

/// An unknown field nested three levels deep — document root, the `words`
/// map, one word's own record — is still an error, not silently dropped.
/// This is the opposite rule from the one below, and both are deliberate.
#[test]
fn unknown_field_nested_three_levels_deep_is_a_typed_error() {
    let document = r#"{
        "v": 1,
        "seed": 1,
        "draw_count": 0,
        "theta": 0.0,
        "theta_se": 1.0,
        "words": {
            "obscure": {
                "state": "SEEDED",
                "due_epoch_ms": 100,
                "encounters": 1,
                "context_frames": [],
                "extra_field_inside_a_word_record": "should error"
            }
        },
        "topic_affinities": {}
    }"#;

    match LearnerState::load(document) {
        Err(LoadError::Malformed { version, .. }) => assert_eq!(version, 1),
        other => panic!("expected Malformed{{version: 1, ..}}, got {other:?}"),
    }
}

/// Tolerance happens at resolution, never at parse (ADR-016's ADR-018-D5
/// amendment). A context frame id this build does not recognise is data,
/// not schema — nothing here validates it against a catalogue — so it
/// round-trips unchanged rather than being dropped.
#[test]
fn unknown_context_frame_id_round_trips_unchanged() {
    let document = r#"{
        "v": 1,
        "seed": 1,
        "draw_count": 0,
        "theta": 0.0,
        "theta_se": 1.0,
        "words": {
            "lighthouse": {
                "state": "LEARNING",
                "due_epoch_ms": 100,
                "encounters": 2,
                "context_frames": ["excerpt-this-build-has-never-heard-of"]
            }
        },
        "topic_affinities": {}
    }"#;

    let loaded = LearnerState::load(document).expect("a known version with a valid shape loads");
    let record = loaded
        .words
        .get("lighthouse")
        .expect("the word is preserved");
    assert_eq!(
        record.context_frames,
        vec!["excerpt-this-build-has-never-heard-of".to_string()]
    );

    let resaved = loaded.to_document();
    assert!(
        resaved.contains("excerpt-this-build-has-never-heard-of"),
        "the unknown context frame id must survive re-serialization:\n{resaved}"
    );
}

// --- The reader-facing `_note` field (BRIEF-009's addendum to ADR-016 D2) ---

/// `_note` is declared, not unknown: a document that carries it loads, and
/// what `to_document` writes back out carries the same sentence — the note
/// round-trips because it is fixed, not because this crate remembers what a
/// caller happened to write in.
#[test]
fn note_field_is_declared_and_round_trips() {
    let document = r#"{
        "v": 1,
        "_note": "whatever a future build once wrote here",
        "seed": 1,
        "draw_count": 0,
        "theta": 0.0,
        "theta_se": 1.0,
        "words": {},
        "topic_affinities": {}
    }"#;

    let loaded = LearnerState::load(document).expect("a document with _note loads");
    let resaved = loaded.to_document();

    assert!(
        resaved.contains("\"_note\""),
        "the note must still be present on re-export:\n{resaved}"
    );
}

/// The `_note` tolerance is narrow: it does not loosen `deny_unknown_fields`
/// for any other field. A document carrying both `_note` and a genuinely
/// unknown field still fails to load.
#[test]
fn an_unrelated_unknown_field_still_fails_even_though_note_is_tolerated() {
    let document = r#"{
        "v": 1,
        "_note": "this is fine",
        "seed": 1,
        "draw_count": 0,
        "theta": 0.0,
        "theta_se": 1.0,
        "words": {},
        "topic_affinities": {},
        "extra_top_level_field": true
    }"#;

    match LearnerState::load(document) {
        Err(LoadError::Malformed { version, .. }) => assert_eq!(version, 1),
        other => panic!("expected Malformed{{version: 1, ..}}, got {other:?}"),
    }
}

// --- The frozen fixture (ADR-016 Decision 2) ---

#[test]
fn the_frozen_v1_fixture_loads_and_reserializes_byte_identically() {
    let fixture_path =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/learner_state_v1.json");
    let original = fs::read_to_string(&fixture_path)
        .unwrap_or_else(|e| panic!("read {}: {e}", fixture_path.display()));

    let loaded = LearnerState::load(&original).expect("the frozen fixture loads");
    let reserialized = loaded.to_document();

    assert_eq!(
        reserialized, original,
        "the frozen v1 fixture must re-serialize byte-identically — a version bump ships a \
         migration and a new fixture, never an edit to this one"
    );

    // The fixture's own promises, restated so a future edit that keeps the
    // round trip passing but quietly loses one of them still fails here.
    assert!(loaded.words.len() >= 2, "at least two words");
    let states: std::collections::BTreeSet<_> =
        loaded.words.values().map(|record| record.state).collect();
    assert!(states.len() >= 2, "the words must be in different states");
    assert!(
        loaded
            .words
            .values()
            .any(|record| !record.context_frames.is_empty()),
        "at least one non-empty context frame list"
    );
}

// --- Property: any LearnerState survives serialize -> load -> serialize ---

fn word_state_strategy() -> impl Strategy<Value = WordState> {
    prop_oneof![
        Just(WordState::Unseen),
        Just(WordState::Seeded),
        Just(WordState::Learning),
        Just(WordState::Consolidating),
        Just(WordState::Automatic),
    ]
}

fn id_strategy() -> impl Strategy<Value = String> {
    "[a-z][a-z0-9-]{0,23}"
}

/// Any interval, or none at all — this is the generic envelope round-trip
/// property, not the scheduler's arithmetic (`tests/scheduler_properties.rs`
/// owns the range invariant), so the strategy is deliberately wider than a
/// valid interval: it exists to prove the field survives serialize -> load
/// -> serialize regardless of what it holds, including `None`, which must
/// survive as a genuinely absent key rather than a written-out `null`.
fn interval_days_strategy() -> impl Strategy<Value = Option<f64>> {
    prop_oneof![Just(None), (-1_000.0..1_000.0f64).prop_map(Some)]
}

fn word_record_strategy() -> impl Strategy<Value = WordRecord> {
    (
        word_state_strategy(),
        any::<u64>(),
        any::<u32>(),
        prop::collection::vec(id_strategy(), 0..5),
        interval_days_strategy(),
    )
        .prop_map(
            |(state, due_millis, encounters, context_frames, interval_days)| {
                WordRecord::new(
                    state,
                    Timestamp::from_millis_since_epoch(due_millis),
                    encounters,
                    context_frames,
                    interval_days,
                )
            },
        )
}

fn learner_state_strategy() -> impl Strategy<Value = LearnerState> {
    (
        any::<u64>(),
        any::<u64>(),
        -10.0..10.0f64,
        0.0..5.0f64,
        prop::collection::btree_map(id_strategy(), word_record_strategy(), 0..6),
        prop::collection::btree_map(id_strategy(), -5.0..5.0f64, 0..6),
    )
        .prop_map(
            |(seed, draw_count, theta, theta_se, words, topic_affinities)| LearnerState {
                seed,
                draw_count,
                theta,
                theta_se,
                words,
                topic_affinities,
            },
        )
}

proptest! {
    /// Round-tripping is the one guarantee the whole envelope exists to
    /// provide: any `LearnerState` generated by the strategy above survives
    /// serialize -> load -> serialize unchanged.
    #[test]
    fn any_learner_state_survives_serialize_load_serialize(state in learner_state_strategy()) {
        let first = state.to_document();
        let loaded = LearnerState::load(&first).expect("a document this module produced always loads");
        let second = loaded.to_document();

        prop_assert_eq!(&loaded, &state);
        prop_assert_eq!(first, second);
    }
}

/// `sample_state` is the exact content the frozen fixture below was
/// generated from (see the fixture's own test). This checks the
/// construction round-trips independent of the file on disk.
#[test]
fn sample_state_round_trips() {
    let state = sample_state();
    let loaded = LearnerState::load(&state.to_document()).expect("sample state loads");
    assert_eq!(loaded, state);
}
