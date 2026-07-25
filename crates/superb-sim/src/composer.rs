//! The composer stand-in: ADR-015's scoring function, run over fixtures.
//!
//! No composer exists yet (engine-contract §6 — the simulator is built
//! *before* it, deliberately, so the composer has a harness to be judged
//! in). This module plays the composer's part well enough to exercise
//! Assertion 5: it reads the due list and word states — which it is
//! entitled to, being the *host*, not the oracle (`src/oracle.rs`'s own doc
//! comment draws that line) — scores a composed candidate against a sourced
//! one using ADR-015's exact function, and picks a winner.
//!
//! **What this module is not.** It does not compose a passage that "reads
//! as writing" (engine-contract §4) — that is real editorial work a real
//! composer will do. It only ever decides *which due words* a session's
//! synthetic passage covers and *which pool* it is drawn from, because those
//! are the only two things ADR-015's assertion is about.

use std::collections::BTreeMap;

use superb_core::state::WordState;
use superb_core::{LearnerState, Timestamp, Tuning};
use superb_core::{backlog_active, due_words};

use crate::tuning_extract::{AdrConstants, Pool};
use crate::vocabulary::Vocabulary;

/// One session's winning candidate: which pool it came from, and which due
/// words it covers, most valuable first (ADR-015's own ordering — the
/// concave decay is applied to this order).
#[derive(Debug, Clone)]
pub struct Passage {
    pub pool: Pool,
    /// Due words this passage covers, sorted most-valuable-first.
    pub due_words: Vec<String>,
}

/// ADR-015's coverage score for one candidate: `Σ coverage_decay^(i-1) *
/// affinity(state_i, pool)`, `i` counting from the most valuable word — the
/// exact function `docs/decisions/README.md`'s ADR-015 states, multiplied by
/// `sourced_preference` when `pool` is `Sourced` (ADR-015 Decision, part 3).
fn score(words: &[String], pool: Pool, learner: &LearnerState, constants: &AdrConstants) -> f64 {
    let mut total = 0.0;
    let mut decay = 1.0;
    for word in words {
        let state = learner
            .words
            .get(word)
            .map(|record| record.state)
            .unwrap_or(WordState::Unseen);
        total += decay * constants.affinity_for(state, pool);
        decay *= constants.coverage_decay;
    }
    if pool == Pool::Sourced {
        total *= constants.sourced_preference;
    }
    total
}

/// Sort `words` most-valuable-first for the given `pool`, so the concave
/// decay in [`score`] applies to the words that are actually worth the most
/// — matching ADR-015's "`i` counting from the most valuable" literally
/// rather than leaving candidate order to whatever `due_words` happened to
/// return.
fn sorted_by_value(
    mut words: Vec<String>,
    pool: Pool,
    learner: &LearnerState,
    constants: &AdrConstants,
) -> Vec<String> {
    words.sort_by(|a, b| {
        let value_of = |word: &str| {
            let state = learner
                .words
                .get(word)
                .map(|record| record.state)
                .unwrap_or(WordState::Unseen);
            constants.affinity_for(state, pool)
        };
        value_of(b)
            .partial_cmp(&value_of(a))
            .expect("affinity values are always finite")
    });
    words
}

/// Choose this session's passage: the composed candidate (any due word is
/// eligible), the sourced candidate (only due words flagged
/// `sourced_eligible` in `vocabulary` — the fixture stand-in for "a genuinely
/// good excerpt exists"), or `None` when nothing is due at all.
///
/// `composed_cap` and `sourced_cap` bound how many due words a single
/// candidate passage covers — the same role `docs/engine-contract.md` §4's
/// "5-8 slot points" plays for a real composed passage.
pub fn choose_passage(
    learner: &LearnerState,
    now: Timestamp,
    tuning: &Tuning,
    vocabulary: &Vocabulary,
    constants: &AdrConstants,
    composed_cap: usize,
    sourced_cap: usize,
) -> Option<Passage> {
    let due = due_words(learner, now);
    if due.is_empty() {
        return None;
    }

    let sourced_eligible: BTreeMap<&str, bool> = vocabulary
        .reading
        .iter()
        .map(|word| (word.id.as_str(), word.sourced_eligible))
        .collect();

    let composed_due: Vec<String> = due.iter().take(composed_cap).cloned().collect();
    let sourced_due: Vec<String> = due
        .iter()
        .filter(|word| {
            sourced_eligible
                .get(word.as_str())
                .copied()
                .unwrap_or(false)
        })
        .take(sourced_cap)
        .cloned()
        .collect();

    let composed_due = sorted_by_value(composed_due, Pool::Composed, learner, constants);
    let sourced_due = sorted_by_value(sourced_due, Pool::Sourced, learner, constants);

    let sourced_is_candidate = sourced_due.len() >= constants.min_sourced_coverage;
    let backlogged = backlog_active(learner, now, tuning);

    // ADR-015's two guards, read exactly as the ADR states them. Below the
    // coverage floor, sourced is not a candidate at all — decoration must
    // not displace a scheduled encounter. Under backlog, the sourced
    // preference is suspended for this request and the highest-coverage
    // candidate wins outright, never the affinity-scored comparison — this
    // is the mechanism the bounded-due-list assertion is provable *because*
    // of, not merely consistent with.
    let winner_is_sourced = if !sourced_is_candidate {
        false
    } else if backlogged {
        sourced_due.len() > composed_due.len()
    } else {
        score(&sourced_due, Pool::Sourced, learner, constants)
            > score(&composed_due, Pool::Composed, learner, constants)
    };

    if winner_is_sourced {
        Some(Passage {
            pool: Pool::Sourced,
            due_words: sourced_due,
        })
    } else if composed_due.is_empty() {
        // Only reachable if every due word is sourced-eligible-only... it
        // is not (composed_due draws from every due word, sourced_due from
        // a subset), so this arm exists for totality, not because it fires
        // in practice.
        None
    } else {
        Some(Passage {
            pool: Pool::Composed,
            due_words: composed_due,
        })
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use superb_core::learner::{LearnerState as CoreLearnerState, WordRecord};
    use superb_core::state::WordState;
    use superb_core::{Timestamp, Tuning};

    use super::*;
    use crate::vocabulary::{Vocabulary, generate};

    fn learner_with(words: BTreeMap<String, WordRecord>) -> CoreLearnerState {
        CoreLearnerState::new(0, 0, 0.0, 1.0, words, BTreeMap::new())
    }

    fn due_record(state: WordState) -> WordRecord {
        WordRecord::new(
            state,
            Timestamp::from_millis_since_epoch(0),
            Vec::new(),
            Some(1.0),
        )
    }

    fn small_vocabulary() -> Vocabulary {
        let mut rng = crate::rng::Rng::new(1);
        generate(&mut rng, 20, 5, 5, 1.0) // every reading word sourced-eligible
    }

    #[test]
    fn no_due_words_produces_no_passage() {
        let learner = learner_with(BTreeMap::new());
        let tuning = Tuning::default();
        let vocabulary = small_vocabulary();
        let constants = AdrConstants::from_tuning(&tuning);
        let now = Timestamp::from_millis_since_epoch(0);

        assert!(choose_passage(&learner, now, &tuning, &vocabulary, &constants, 6, 3).is_none());
    }

    /// Below `min_sourced_coverage`, sourced is not a candidate at all — the
    /// composed candidate wins even though every due word is
    /// sourced-eligible.
    #[test]
    fn below_the_coverage_floor_sourced_is_not_a_candidate() {
        let mut words = BTreeMap::new();
        words.insert("read-0000".to_string(), due_record(WordState::Automatic));
        let learner = learner_with(words);
        let tuning = Tuning::default();
        let vocabulary = small_vocabulary();
        let constants = AdrConstants::from_tuning(&tuning);
        let now = Timestamp::from_millis_since_epoch(0);

        let passage = choose_passage(&learner, now, &tuning, &vocabulary, &constants, 6, 3)
            .expect("one due word produces a passage");
        assert_eq!(passage.pool, Pool::Composed);
    }

    /// A due list past `backlog_override_due` (40, shipped) suspends the
    /// sourced preference: composed, which can cover more, wins outright.
    #[test]
    fn backlog_forces_the_highest_coverage_candidate() {
        let mut words = BTreeMap::new();
        for i in 0..45 {
            words.insert(format!("read-{i:04}"), due_record(WordState::Automatic));
        }
        let learner = learner_with(words);
        let tuning = Tuning::default();
        let vocabulary = small_vocabulary();
        let constants = AdrConstants::from_tuning(&tuning);
        let now = Timestamp::from_millis_since_epoch(0);

        let passage = choose_passage(&learner, now, &tuning, &vocabulary, &constants, 6, 3)
            .expect("a large due list still produces a passage");
        assert_eq!(passage.pool, Pool::Composed);
    }
}
