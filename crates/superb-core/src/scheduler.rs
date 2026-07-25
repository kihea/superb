//! When a word comes back.
//!
//! BRIEF-009's escalation is answered: `WordRecord` (`src/learner.rs`) gains
//! `interval_days`, the value that survives from one encounter to the next so
//! [`schedule_encounter`] can multiply it rather than invent it. The
//! ARCHITECT'S ANSWER in `workspace/briefs/BRIEF-009-scheduler.md` is the
//! record of why it is stored rather than derived — read it before changing
//! this module's arithmetic.
//!
//! What's here: [`schedule_encounter`], the pure function that turns one
//! encounter into a next due date, a next `interval_days`, and the
//! `IntervalSet` effect (engine-contract §3); the due list as a query over
//! state rather than a second, driftable copy of it; and ADR-015's two
//! backlog guards, combined into the one predicate the composer will read.

use serde::Serialize;

use crate::learner::{LearnerState, Timestamp};
use crate::state::WordState;
use crate::tuning::Tuning;

/// Milliseconds in a day — the unit `tuning.toml` states its day-valued
/// constants in (`backlog_override_age_days`, every `interval_*` constant),
/// converted once here rather than at every call site.
const MILLIS_PER_DAY: u64 = 24 * 60 * 60 * 1000;

/// What happened to a word this encounter, exactly as far as the interval
/// arithmetic in [`schedule_encounter`] needs to know it. `src/state.rs`
/// decides — separately — whether the same encounter also moves the word
/// between `WordState`s; this brief is out of that decision (see this
/// module's own "Out of scope" in the brief) and this enum carries nothing
/// else.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EncounterOutcome {
    /// The word was met and recognised without help: a passage finished with
    /// the word intact, a probe assembled correctly. Widens the interval by
    /// the per-state multiplier.
    Clean,
    /// The reader tapped the gloss, or a probe failed — the strongest
    /// negative signal, explicit "not automatic" (engine-contract §3).
    /// Shortens the interval by multiplying it, never resetting it.
    GlossTap,
}

/// What [`schedule_encounter`] decided.
///
/// `due` and `effect.due` are always the same [`Timestamp`] — both are
/// exposed because the brief's Done clause asks for the timestamp itself as
/// well as the effect, and a caller updating `WordRecord.due_epoch_ms`
/// should not have to reach into the effect payload to get it.
/// `interval_days` is the value that same caller writes into
/// `WordRecord.interval_days` alongside `due_epoch_ms` — the two are always
/// written together (BRIEF-009's ARCHITECT'S ANSWER).
#[derive(Debug, Clone, PartialEq)]
pub struct ScheduleDecision {
    /// The word's next due timestamp. Equal to `effect.due`.
    pub due: Timestamp,
    /// The interval, in days, that produced `due` — write this into
    /// `WordRecord.interval_days`.
    pub interval_days: f64,
    /// The effect to persist and re-render (engine-contract §3).
    pub effect: IntervalSet,
}

/// The scheduler's one effect (engine-contract §3): `IntervalSet { word,
/// due }`, matched field-for-field against the contract rather than
/// approximated — the effect names and payloads are a public contract.
///
/// Boundary tier in `wire-roster.toml`, not durable: this type is never
/// reachable from [`LearnerState`]. The interval this effect's `due` was
/// computed from is persisted separately, in `WordRecord.interval_days` —
/// the effect only ever carries the due date the host is told to act on.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct IntervalSet {
    /// The word this due date belongs to.
    pub word: String,
    /// When the word is next due.
    pub due: Timestamp,
}

/// The multiplier a `Clean` outcome applies to the current interval (Done
/// clause 2). `tuning.toml` names one for `Learning`, `Consolidating`, and
/// `Automatic` only — a word met while `Unseen` or `Seeded` has not yet
/// entered spaced review (`src/state.rs`'s own doc comments: `Seeded` is "met
/// once... nothing is known yet about whether it stuck"), so there is
/// nothing yet to widen. The multiplier for those two states is 1.0: the
/// interval carries forward unchanged rather than borrowing a rate
/// `tuning.toml` does not define for them. This is also what makes "a clean
/// pass never shortens" hold for every state without exception, rather than
/// four states out of five.
fn widen_multiplier(state: WordState, tuning: &Tuning) -> f64 {
    match state {
        WordState::Unseen | WordState::Seeded => 1.0,
        WordState::Learning => tuning.interval_learning,
        WordState::Consolidating => tuning.interval_consolidating,
        WordState::Automatic => tuning.interval_automatic,
    }
}

/// `days`, converted to whole milliseconds a [`u64::saturating_add`] can
/// always consume. Every caller in this module hands in an `interval_days`
/// already clamped to `[interval_initial_days, interval_max_days]`, so these
/// guards are defence against a future caller or a hostile `Tuning`
/// (`interval_max_days` set absurdly high), not the ordinary path — but the
/// "never negative, never zero, never above the ceiling" property is stated
/// over every input, adversarial ones included, so this function holds to
/// the same standard.
fn days_to_millis(days: f64) -> u64 {
    let millis = days * MILLIS_PER_DAY as f64;
    if !millis.is_finite() || millis <= 0.0 {
        0
    } else if millis >= u64::MAX as f64 {
        u64::MAX
    } else {
        millis.round() as u64
    }
}

/// Decide when a word comes back.
///
/// Pure (engine-contract §1): `learner`, `word`, `outcome`, `now`, and
/// `tuning` are the whole input, and nothing outside them is read — no
/// clock, no RNG, no I/O. `word`'s current state and stored `interval_days`
/// come from `learner.words`; a word not present there at all is treated as
/// `Unseen` with no stored interval — the "word with no history at all" the
/// brief's Verifier names, handled the same way as a word with a record but
/// no `interval_days` yet.
///
/// A `Clean` outcome multiplies the current interval by
/// [`widen_multiplier`]'s per-state rate (Done clause 2). A `GlossTap`
/// multiplies it by `tuning.interval_lapse`, floored at
/// `tuning.interval_initial_days` — a lapse loses ground, never all of it
/// (Done clause 3; a lapsed word is not an unknown word). Either way the
/// result is clamped to `[interval_initial_days, interval_max_days]` before
/// it is used to compute the next due date or returned, which is also what
/// keeps the arithmetic sane against a corrupted or adversarial stored
/// interval: `f64::max`/`f64::min` return the non-`NaN` operand when the
/// other is `NaN`, so a `NaN`, negative, or infinite `interval_days` already
/// sitting in `learner.words` is absorbed here rather than propagated.
///
/// The next due date is `now + interval_days`, not `due_epoch_ms +
/// interval_days` — a word due a year ago, or met again before its previous
/// due date, still gets a due date computed from when it was actually met,
/// rather than compounding drift from a stale one.
pub fn schedule_encounter(
    learner: &LearnerState,
    word: &str,
    outcome: EncounterOutcome,
    now: Timestamp,
    tuning: &Tuning,
) -> ScheduleDecision {
    let (state, current_interval_days) = match learner.words.get(word) {
        Some(record) => (record.state, record.interval_days()),
        None => (WordState::Unseen, None),
    };

    let base = current_interval_days.unwrap_or(tuning.interval_initial_days);

    let raw_interval_days = match outcome {
        EncounterOutcome::Clean => base * widen_multiplier(state, tuning),
        EncounterOutcome::GlossTap => base * tuning.interval_lapse,
    };

    let interval_days = raw_interval_days
        .max(tuning.interval_initial_days)
        .min(tuning.interval_max_days);

    let due_millis = now
        .millis_since_epoch()
        .saturating_add(days_to_millis(interval_days));
    let due = Timestamp::from_millis_since_epoch(due_millis);

    ScheduleDecision {
        due,
        interval_days,
        effect: IntervalSet {
            word: word.to_string(),
            due,
        },
    }
}

/// Every word due at or before `now`, oldest-due first.
///
/// A query over `learner.words`, computed fresh on every call rather than
/// read from a stored list: a cached due list is a second source of truth
/// that can drift from `WordRecord.due_epoch_ms`, and the bounded-due-list
/// assertion `docs/engine-contract.md` §5 makes turns on there being exactly
/// one place this answer comes from.
///
/// Ties — two words due at the same millisecond — break on word id, so the
/// order is deterministic rather than an accident of `BTreeMap`'s own
/// iteration order agreeing with due order.
pub fn due_words(learner: &LearnerState, now: Timestamp) -> Vec<String> {
    let now_ms = now.millis_since_epoch();

    let mut due: Vec<(u64, &str)> = learner
        .words
        .iter()
        .filter(|(_, record)| record.due_epoch_ms().millis_since_epoch() <= now_ms)
        .map(|(word, record)| (record.due_epoch_ms().millis_since_epoch(), word.as_str()))
        .collect();
    due.sort();

    due.into_iter().map(|(_, word)| word.to_string()).collect()
}

/// ADR-015's two backlog guards, combined into the one predicate the
/// composer reads. True when the due list has grown large enough, or its
/// oldest member has waited long enough, that the composer must suspend the
/// sourced preference for this request and let the highest-coverage
/// candidate win — the mechanism that keeps the bounded-due-list assertion
/// provable rather than hoped for.
///
/// **Exposed, not consumed.** Reading `backlog_active` and acting on it is
/// the composer's job (a later brief); this function only answers the
/// question.
pub fn backlog_active(learner: &LearnerState, now: Timestamp, tuning: &Tuning) -> bool {
    let due = due_words(learner, now);

    // The count guard: ADR-015 says "exceeds `backlog_override_due` words",
    // so the threshold count itself is still fine — the guard fires one
    // word past it.
    if due.len() as u32 > tuning.backlog_override_due {
        return true;
    }

    // The age guard: "the oldest due word exceeds `backlog_override_age`."
    // `due` is sorted oldest-first, so the first entry — if any — is the one
    // to check. A due list with nothing in it cannot be backlogged on age.
    let Some(oldest) = due.first() else {
        return false;
    };
    let oldest_due_ms = learner.words[oldest].due_epoch_ms().millis_since_epoch();
    let age_ms = now.millis_since_epoch().saturating_sub(oldest_due_ms);
    let age_threshold_ms = u64::from(tuning.backlog_override_age_days) * MILLIS_PER_DAY;

    age_ms > age_threshold_ms
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::learner::WordRecord;
    use crate::state::WordState;
    use std::collections::BTreeMap;

    fn learner_with(words: BTreeMap<String, WordRecord>) -> LearnerState {
        LearnerState::new(0, 0, 0.0, 1.0, words, BTreeMap::new())
    }

    fn record_due_at(millis: u64) -> WordRecord {
        WordRecord::new(
            WordState::Learning,
            Timestamp::from_millis_since_epoch(millis),
            Vec::new(),
            Some(1.0),
        )
    }

    /// A learner with exactly one word, `"w"`, holding `state` and
    /// `interval_days` (or `None`, for "never scheduled"), due at
    /// `due_millis`. Shared by [`schedule_encounter`]'s own tests below.
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
                Vec::new(),
                interval_days,
            ),
        );
        learner_with(words)
    }

    #[test]
    fn due_words_excludes_not_yet_due_and_orders_oldest_first() {
        let mut words = BTreeMap::new();
        words.insert("later".to_string(), record_due_at(3_000));
        words.insert("earliest".to_string(), record_due_at(1_000));
        words.insert("not-yet-due".to_string(), record_due_at(9_000));
        words.insert("middle".to_string(), record_due_at(2_000));

        let learner = learner_with(words);
        let now = Timestamp::from_millis_since_epoch(3_000);

        assert_eq!(
            due_words(&learner, now),
            vec![
                "earliest".to_string(),
                "middle".to_string(),
                "later".to_string(),
            ]
        );
    }

    #[test]
    fn due_words_includes_a_word_due_exactly_at_now() {
        let mut words = BTreeMap::new();
        words.insert("on-time".to_string(), record_due_at(5_000));

        let learner = learner_with(words);
        let now = Timestamp::from_millis_since_epoch(5_000);

        assert_eq!(due_words(&learner, now), vec!["on-time".to_string()]);
    }

    #[test]
    fn due_words_is_empty_for_a_learner_with_no_words() {
        let learner = learner_with(BTreeMap::new());
        let now = Timestamp::from_millis_since_epoch(1);

        assert!(due_words(&learner, now).is_empty());
    }

    /// The default shipped tuning sets `backlog_override_due` to 40 — the
    /// guard fires one word past it, never at it.
    #[test]
    fn backlog_active_fires_at_exactly_the_due_count_threshold() {
        let tuning = Tuning::default();
        let recent = 0; // recently due, so the age guard cannot also fire.
        let now = Timestamp::from_millis_since_epoch(MILLIS_PER_DAY); // one day old

        for (count, expected) in [(39u32, false), (40, false), (41, true)] {
            let mut words = BTreeMap::new();
            for i in 0..count {
                words.insert(format!("word-{i}"), record_due_at(recent));
            }
            let learner = learner_with(words);

            assert_eq!(
                backlog_active(&learner, now, &tuning),
                expected,
                "due count {count}"
            );
        }
    }

    /// The default shipped tuning sets `backlog_override_age_days` to 7 —
    /// the guard fires one day past it, never at it.
    #[test]
    fn backlog_active_fires_at_exactly_the_age_threshold() {
        let tuning = Tuning::default();
        let now_ms = 100 * MILLIS_PER_DAY;
        let now = Timestamp::from_millis_since_epoch(now_ms);

        for (age_days, expected) in [(6u64, false), (7, false), (8, true)] {
            let mut words = BTreeMap::new();
            // A single due word, well under the count guard, isolates the
            // age guard.
            words.insert(
                "oldest".to_string(),
                record_due_at(now_ms - age_days * MILLIS_PER_DAY),
            );
            let learner = learner_with(words);

            assert_eq!(
                backlog_active(&learner, now, &tuning),
                expected,
                "age {age_days} days"
            );
        }
    }

    #[test]
    fn backlog_active_is_false_for_a_learner_with_no_due_words() {
        let tuning = Tuning::default();
        let learner = learner_with(BTreeMap::new());
        let now = Timestamp::from_millis_since_epoch(1);

        assert!(!backlog_active(&learner, now, &tuning));
    }

    // --- schedule_encounter: the arithmetic Done clauses 1-4, 6-8, and 11-12 ask for ---

    /// `IntervalSet` matches engine-contract §3's `IntervalSet { word, due }`
    /// literally: exactly these two keys, nothing else — a mismatch here is
    /// a spec defect, not a naming preference.
    #[test]
    fn interval_set_serializes_as_exactly_word_and_due() {
        let effect = IntervalSet {
            word: "aperture".to_string(),
            due: Timestamp::from_millis_since_epoch(1_000),
        };

        let value = serde_json::to_value(&effect).expect("IntervalSet serializes");
        let object = value
            .as_object()
            .expect("IntervalSet serializes as an object");

        assert_eq!(
            object.keys().collect::<std::collections::BTreeSet<_>>(),
            std::collections::BTreeSet::from([&"word".to_string(), &"due".to_string()])
        );
        assert_eq!(object["word"], "aperture");
        assert_eq!(object["due"], 1_000);
    }

    /// Done clause 3: a lapse multiplies the old interval by
    /// `interval_lapse` rather than resetting it to `interval_initial_days`
    /// — computed from the shipped tuning's own constants rather than
    /// hardcoded, so this checks the relationship the brief specifies, not
    /// today's guess at a curve (the brief's own "what these clauses do not
    /// catch" warns against pinning a specific interval value).
    #[test]
    fn lapse_multiplies_the_old_interval_rather_than_resetting_it() {
        let tuning = Tuning::default();
        // Comfortably above the floor, so the multiply is observable rather
        // than immediately clamped back up to it.
        let previous = tuning.interval_initial_days * 20.0;
        let learner = learner_with_word(WordState::Automatic, Some(previous), 0);
        let now = Timestamp::from_millis_since_epoch(0);

        let decision = schedule_encounter(&learner, "w", EncounterOutcome::GlossTap, now, &tuning);

        let expected = (previous * tuning.interval_lapse).max(tuning.interval_initial_days);
        assert!(
            (decision.interval_days - expected).abs() < 1e-9,
            "expected {expected}, got {}",
            decision.interval_days
        );
        assert!(
            decision.interval_days > tuning.interval_initial_days,
            "a lapse with room to fall should lose ground, not all of it"
        );
    }

    /// A lapse that starts at the floor cannot fall below it — the floor is
    /// exact, not merely "shorter than before."
    #[test]
    fn lapse_from_the_initial_interval_holds_at_the_floor() {
        let tuning = Tuning::default();
        let learner = learner_with_word(WordState::Learning, Some(tuning.interval_initial_days), 0);
        let now = Timestamp::from_millis_since_epoch(0);

        let decision = schedule_encounter(&learner, "w", EncounterOutcome::GlossTap, now, &tuning);

        assert_eq!(decision.interval_days, tuning.interval_initial_days);
    }

    /// Done clause 4: twenty consecutive clean passes — the only way to
    /// reach the ceiling — never push the interval above
    /// `interval_max_days`, and (with the shipped `interval_automatic` of
    /// 3.0, comfortably saturating before pass twenty) actually reach it.
    #[test]
    fn ceiling_holds_after_twenty_consecutive_clean_passes() {
        let tuning = Tuning::default();
        let mut learner = learner_with_word(WordState::Automatic, None, 0);
        let mut now = Timestamp::from_millis_since_epoch(0);

        for pass in 0..20 {
            let decision = schedule_encounter(&learner, "w", EncounterOutcome::Clean, now, &tuning);
            assert!(
                decision.interval_days <= tuning.interval_max_days,
                "pass {pass}: interval {} exceeded the ceiling {}",
                decision.interval_days,
                tuning.interval_max_days
            );
            let record = learner.words.get_mut("w").expect("word exists");
            record.set_due_and_interval(decision.due, decision.interval_days);
            now = decision.due;
        }

        assert_eq!(
            learner.words["w"].interval_days(),
            Some(tuning.interval_max_days),
            "twenty clean passes in Automatic should have saturated the ceiling"
        );
    }

    /// Verifier: "a word due a year ago" — a stale due date must not confuse
    /// the arithmetic. The next due date is computed from `now`, not from
    /// the stale `due_epoch_ms`.
    #[test]
    fn word_due_a_year_ago_produces_a_sane_interval() {
        let tuning = Tuning::default();
        let a_year_ms = 365 * MILLIS_PER_DAY;
        let learner = learner_with_word(WordState::Consolidating, Some(10.0), 0);
        let now = Timestamp::from_millis_since_epoch(a_year_ms);

        let decision = schedule_encounter(&learner, "w", EncounterOutcome::Clean, now, &tuning);

        assert!(decision.interval_days > 0.0);
        assert!(decision.interval_days <= tuning.interval_max_days);
        assert!(decision.due.millis_since_epoch() > now.millis_since_epoch());
    }

    /// Verifier: "a `now` earlier than the last encounter" — the reader met
    /// the word again before its previously scheduled due date. Still no
    /// panic and still a bounded, positive interval.
    #[test]
    fn now_earlier_than_the_previous_due_date_produces_a_sane_interval() {
        let tuning = Tuning::default();
        let learner = learner_with_word(WordState::Learning, Some(5.0), 30 * MILLIS_PER_DAY);
        let now = Timestamp::from_millis_since_epoch(0);

        let decision = schedule_encounter(&learner, "w", EncounterOutcome::Clean, now, &tuning);

        assert!(decision.interval_days > 0.0);
        assert!(decision.interval_days <= tuning.interval_max_days);
    }

    /// Verifier: "an interval already at the ceiling" — a clean pass cannot
    /// push it further, and a lapse still shortens it correctly from there.
    #[test]
    fn interval_already_at_the_ceiling_does_not_overflow_on_a_clean_pass() {
        let tuning = Tuning::default();
        let learner = learner_with_word(WordState::Automatic, Some(tuning.interval_max_days), 0);
        let now = Timestamp::from_millis_since_epoch(0);

        let decision = schedule_encounter(&learner, "w", EncounterOutcome::Clean, now, &tuning);

        assert_eq!(decision.interval_days, tuning.interval_max_days);
    }

    /// Verifier: "a lapse from `Automatic` with a 180-day interval" — the
    /// shipped ceiling, lapsed from.
    #[test]
    fn lapse_from_automatic_at_the_shipped_ceiling_is_sane() {
        let tuning = Tuning::default();
        let learner = learner_with_word(WordState::Automatic, Some(tuning.interval_max_days), 0);
        let now = Timestamp::from_millis_since_epoch(0);

        let decision = schedule_encounter(&learner, "w", EncounterOutcome::GlossTap, now, &tuning);

        let expected =
            (tuning.interval_max_days * tuning.interval_lapse).max(tuning.interval_initial_days);
        assert!((decision.interval_days - expected).abs() < 1e-9);
        assert!(decision.interval_days > 0.0);
        assert!(decision.interval_days < tuning.interval_max_days);
    }

    /// Verifier: "a word with no history at all" — not present in
    /// `learner.words`. Treated as `Unseen` with no stored interval, so a
    /// clean pass sets the first interval to `interval_initial_days`.
    #[test]
    fn word_with_no_history_at_all_gets_the_initial_interval() {
        let tuning = Tuning::default();
        let learner = learner_with(BTreeMap::new());
        let now = Timestamp::from_millis_since_epoch(0);

        let decision =
            schedule_encounter(&learner, "never-met", EncounterOutcome::Clean, now, &tuning);

        assert_eq!(decision.interval_days, tuning.interval_initial_days);
        assert_eq!(decision.effect.word, "never-met");
        assert_eq!(decision.effect.due, decision.due);
    }
}
