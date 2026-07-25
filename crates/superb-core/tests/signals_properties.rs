//! Properties of `rank` (BRIEF-011). The style matches
//! `tests/scheduler_properties.rs` and `tests/ability_properties.rs`: an
//! oracle-style helper naming exactly what varies, and `proptest` sampling
//! broadly rather than at a handful of fixed points.

use proptest::prelude::*;
use superb_core::tuning::Tuning;
use superb_core::{Direction, Event, rank};

/// A `Tuning` identical to the shipped default except for the three signal
/// strengths, which are set to `probe`, `negative`, and `dwell` — every
/// other field (all of them already range-checked elsewhere) carries
/// forward unchanged. `Tuning`'s fields are `pub(crate)` (engine-contract §1
/// law 6): the only way to build one from outside the crate — which this
/// test file is, being under `tests/` — is [`Tuning::from_toml_str`], so
/// this helper edits the shipped tuning as TOML and reparses it, the same
/// path a legal edit to `tuning.toml` itself would take. That is also *why*
/// the property below is checked against the shape `Tuning::validate`
/// enforces rather than only against the numbers `tuning.toml` ships today:
/// a legal edit to the file can only ever produce a `Tuning` this same
/// helper could also have produced, and an illegal one is refused here
/// exactly as it would be at the file.
fn tuning_with_signal_strengths(probe: f64, negative: f64, dwell: f64) -> Tuning {
    let mut document =
        toml::Value::try_from(Tuning::default()).expect("Tuning serializes to a TOML value");
    let table = document
        .as_table_mut()
        .expect("Tuning serializes to a TOML table");
    table.insert(
        "signal_strength_probe_positive".to_string(),
        toml::Value::Float(probe),
    );
    table.insert(
        "signal_strength_negative_strong".to_string(),
        toml::Value::Float(negative),
    );
    table.insert(
        "signal_strength_dwell_negative".to_string(),
        toml::Value::Float(dwell),
    );

    let edited = toml::to_string(&document).expect("the edited document serializes to TOML");
    Tuning::from_toml_str(&edited)
        .expect("a strictly descending, strictly positive triple validates")
}

/// Three strictly descending, strictly positive `f64`s — the exact shape
/// `Tuning::validate` requires of the three signal strengths, and the
/// domain the Verifier's "under the tuning file's stated ranges" demand is
/// stated over. Built from three independent positive samples, sorted
/// descending, with a floor under the smallest so the gaps stay
/// well-defined even at proptest's shrunk extremes.
fn descending_positive_triple_strategy() -> impl Strategy<Value = (f64, f64, f64)> {
    (0.01f64..1_000.0, 0.01f64..1_000.0, 0.01f64..1_000.0).prop_map(|(a, b, c)| {
        let mut values = [a, b, c];
        values.sort_by(|x, y| y.partial_cmp(x).expect("samples are finite"));
        // Guarantee strictness even when two samples land on the same
        // float: nudge the lower two down by a fixed, tiny margin each.
        let high = values[0] + 0.02;
        let mid = values[1] + 0.01;
        let low = values[2];
        (high, mid, low)
    })
}

proptest! {
    /// The Verifier's own demand: "check the ordering holds under the
    /// tuning file's stated ranges rather than only at its current
    /// values." For any `Tuning` `Tuning::validate` would accept — not just
    /// the shipped one — a correctly assembled probe outranks a gloss tap
    /// outranks a dwell on a single-target screen.
    #[test]
    fn probe_outranks_gloss_outranks_dwell_for_any_legal_tuning(
        (probe_strength, negative_strength, dwell_strength) in descending_positive_triple_strategy(),
    ) {
        let tuning = tuning_with_signal_strengths(probe_strength, negative_strength, dwell_strength);

        let probe = rank(
            &Event::ProbeResult {
                word: "w".to_string(),
                assembled: true,
                attempts: 1,
            },
            &tuning,
        )
        .expect("an assembled probe always produces a signal");

        let gloss = rank(
            &Event::GlossTap {
                word: "w".to_string(),
                passage: "p".to_string(),
                position: 0,
            },
            &tuning,
        )
        .expect("a gloss tap always produces a signal");

        let dwell = rank(
            &Event::ScreenDwell {
                screen_id: "s".to_string(),
                words_on_screen: vec!["w".to_string()],
                ms: 1_000,
            },
            &tuning,
        )
        .expect("a dwell on one target word always produces a signal");

        prop_assert!(probe.strength() > gloss.strength());
        prop_assert!(gloss.strength() > dwell.strength());
        prop_assert_eq!(probe.direction(), Direction::For);
        prop_assert_eq!(gloss.direction(), Direction::Against);
        prop_assert_eq!(dwell.direction(), Direction::Against);
    }

    /// Property (Done clause): `rank` is total. Every `Event` variant,
    /// constructed with arbitrary strings, vectors (including empty ones),
    /// and numbers (including zero), returns without panicking — sampled
    /// broadly rather than only at the handful of concrete edge cases
    /// `src/signals.rs`'s own tests name.
    #[test]
    fn rank_never_panics(
        variant in 0usize..6,
        word in ".*",
        passage in ".*",
        position in any::<u32>(),
        assembled in any::<bool>(),
        attempts in any::<u32>(),
        screen_id in ".*",
        words in prop::collection::vec(".*", 0..6),
        ms in any::<u64>(),
        item_id in ".*",
        is_pseudoword in any::<bool>(),
        knew in any::<bool>(),
    ) {
        let tuning = Tuning::default();
        let event = match variant {
            0 => Event::DeckSwipe { item_id, is_pseudoword, knew },
            1 => Event::GlossTap { word, passage, position },
            2 => Event::ProbeResult { word, assembled, attempts },
            3 => Event::ScreenDwell { screen_id, words_on_screen: words, ms },
            4 => Event::PassageFinished { passage, words_seen: words },
            _ => Event::PassageAbandoned { passage, words_seen: words },
        };

        // The call itself is the assertion: a panic fails the test.
        let _ = rank(&event, &tuning);
    }

    /// Property: `rank` is deterministic, so the same event never produces
    /// a second, different signal about the same word — the type signature
    /// already forbids more than one `Signal` per call, and this confirms
    /// nothing about `rank` depends on anything but its two arguments.
    #[test]
    fn rank_is_deterministic(
        word in ".*",
        assembled in any::<bool>(),
    ) {
        let tuning = Tuning::default();
        let event = Event::ProbeResult { word, assembled, attempts: 1 };

        prop_assert_eq!(rank(&event, &tuning), rank(&event, &tuning));
    }
}
