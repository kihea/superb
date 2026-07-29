//! A synthetic learner's known vocabulary — the ground truth the oracle
//! (`src/oracle.rs`) reads from and `superb-core` never sees.
//!
//! Every word here carries a `true_difficulty`, on the same logit scale
//! `superb-core::ability` puts θ and item difficulty on. That scale is the
//! one thing this module borrows from the engine's own documented model
//! (`ability.rs`'s doc comment states the formula in prose); the *number*
//! for any given word is invented here, by this crate's own RNG, and the
//! engine is never asked what it thinks a word's difficulty is — the engine
//! is only ever told the learner's *claim*, exactly as a real deck or a real
//! passage would.
//!
//! Three disjoint pools, on purpose, so the mechanisms under test do not
//! contaminate each other:
//!
//! - **Reading vocabulary** — the words a synthetic session's passages draw
//!   from. Some are flagged `sourced_eligible`, standing in for "this word
//!   has a genuinely good sourced excerpt available" (ADR-015; no composer
//!   exists yet, so this flag is the fixture-level stand-in the brief's Done
//!   clause asks for).
//! - **Calibration pool** — real words used only for `DeckSwipe` events.
//!   Disjoint from the reading vocabulary so a calibration draw's own
//!   `schedule_and_record` (every `DeckSwipe` schedules the word — see
//!   `engine.rs::decide_deck_swipe`) never pushes a reading word's due date
//!   around and confounds Assertion 2's encounter count or Assertion 3's
//!   due-list size with a mechanism neither assertion is about.
//! - **Pseudoword pool** — ids only; a pseudoword carries no difficulty
//!   (`ability::update_theta`'s own doc comment: "there is no difficulty for
//!   one to be evaluated against").
//!
//! **[`generate_real`] collapses the first two pools on purpose — see its own
//! doc comment.** It exists for issue #35's real-corpus battery, where the
//! disjointness above stops being free: a due word the real library cannot
//! serve queues forever, so every word the deck can put on the schedule has
//! to be a word the real content can actually reach.

use std::collections::{BTreeMap, BTreeSet};

use crate::rng::Rng;

/// One real word: an id `superb-core` treats as an opaque string, and the
/// ground-truth difficulty this crate's oracle reads to decide whether the
/// synthetic learner knows it.
#[derive(Debug, Clone)]
pub struct WordSpec {
    pub id: String,
    pub true_difficulty: f64,
    /// Stands in for "a genuinely good sourced excerpt exists for this
    /// word" (ADR-015) — a fixture-level flag, since no composer exists to
    /// compute it from real content yet.
    pub sourced_eligible: bool,
}

/// A synthetic learner's whole vocabulary: three disjoint pools, generated
/// once from one RNG draw sequence so a run is exactly reproducible from its
/// seed.
#[derive(Debug, Clone)]
pub struct Vocabulary {
    pub reading: Vec<WordSpec>,
    pub calibration: Vec<WordSpec>,
    pub pseudowords: Vec<String>,
    /// This synthetic reader's hidden liking for each topic, 0.0 to 1.0
    /// (ADR-022). Ground truth for the recommender the same way
    /// `true_difficulty` is ground truth for the estimator: invented here,
    /// read only by `oracle::finishes_passage`, and never visible to
    /// `superb-core`, which sees only whether a passage was finished.
    pub topic_taste: BTreeMap<String, f64>,
}

impl Vocabulary {
    pub fn true_difficulty(&self, word_id: &str) -> f64 {
        self.reading
            .iter()
            .chain(self.calibration.iter())
            .find(|spec| spec.id == word_id)
            .map(|spec| spec.true_difficulty)
            .unwrap_or_else(|| panic!("{word_id} is not in this vocabulary"))
    }
}

/// Build a vocabulary from `rng`. `reading_size` and `calibration_size` are
/// real-word pool sizes; `pseudoword_size` is the pseudoword pool. Difficulty
/// is drawn uniformly across a wider range than θ's own clamp
/// (`tuning.theta_min`/`theta_max`, ±4.0 in the shipped file) so that every
/// true θ this brief tests, extremes included, meets both easy and hard
/// words in its own vocabulary. `sourced_eligible_rate` is the fraction of
/// the *reading* pool flagged as having a good sourced excerpt available —
/// see this module's own doc comment on why that flag exists at all.
pub fn generate(
    rng: &mut Rng,
    reading_size: usize,
    calibration_size: usize,
    pseudoword_size: usize,
    sourced_eligible_rate: f64,
) -> Vocabulary {
    let reading = (0..reading_size)
        .map(|i| WordSpec {
            id: format!("read-{i:04}"),
            true_difficulty: rng.range(-4.5, 4.5),
            sourced_eligible: rng.chance(sourced_eligible_rate),
        })
        .collect();

    let topic_taste = crate::library::TOPICS
        .iter()
        .map(|topic| ((*topic).to_string(), rng.next_unit()))
        .collect();

    let calibration = (0..calibration_size)
        .map(|i| WordSpec {
            id: format!("cal-{i:04}"),
            true_difficulty: rng.range(-4.5, 4.5),
            sourced_eligible: false,
        })
        .collect();

    let pseudowords = (0..pseudoword_size)
        .map(|i| format!("pseudo-{i:04}"))
        .collect();

    Vocabulary {
        reading,
        calibration,
        pseudowords,
        topic_taste,
    }
}

/// Build a vocabulary over a fixed real-word population instead of inventing
/// ids. Same borrowed logic `generate` uses for everything it *has* to
/// invent — `true_difficulty` (no real difficulty exists for these words;
/// see `oracle.rs`'s own boundary) and `topic_taste` — over words and topics
/// this crate did not choose the spelling of (`crate::corpus::RealCorpus`).
///
/// **Why `calibration` is `reading.clone()` rather than a disjoint pool.**
/// `generate`'s own doc comment explains the synthetic split: a disjoint
/// calibration pool keeps a calibration draw's own scheduling from
/// confounding the encounter-count assertions that pool is not for. That
/// concern does not apply to the real-corpus battery this function exists
/// for — it is not measuring Assertion 2's encounter count, it is measuring
/// which pool serves a due word, and a due word the deck put on the schedule
/// has to be servable by real content or it queues forever
/// (`crate::corpus::RealCorpus`'s own doc comment on `word_classes`). Every
/// calibration draw is therefore also a reading word the real library can
/// actually try to serve — composed, sourced, or (honestly, and part of what
/// the battery measures) neither.
pub fn generate_real(
    rng: &mut Rng,
    reading_words: &[String],
    sourced_words: &BTreeSet<String>,
    topics: &BTreeSet<String>,
    pseudoword_size: usize,
) -> Vocabulary {
    let reading: Vec<WordSpec> = reading_words
        .iter()
        .map(|id| WordSpec {
            id: id.clone(),
            true_difficulty: rng.range(-4.5, 4.5),
            sourced_eligible: sourced_words.contains(id),
        })
        .collect();

    let topic_taste = topics
        .iter()
        .map(|topic| (topic.clone(), rng.next_unit()))
        .collect();

    let pseudowords = (0..pseudoword_size)
        .map(|i| format!("pseudo-{i:04}"))
        .collect();

    Vocabulary {
        calibration: reading.clone(),
        reading,
        pseudowords,
        topic_taste,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_is_deterministic_from_its_seed() {
        let mut a = Rng::new(123);
        let mut b = Rng::new(123);
        let vocab_a = generate(&mut a, 20, 5, 5, 0.3);
        let vocab_b = generate(&mut b, 20, 5, 5, 0.3);
        assert_eq!(
            vocab_a
                .reading
                .iter()
                .map(|w| (w.id.clone(), w.true_difficulty, w.sourced_eligible))
                .collect::<Vec<_>>(),
            vocab_b
                .reading
                .iter()
                .map(|w| (w.id.clone(), w.true_difficulty, w.sourced_eligible))
                .collect::<Vec<_>>(),
        );
    }

    #[test]
    fn reading_and_calibration_pools_are_disjoint() {
        let mut rng = Rng::new(7);
        let vocab = generate(&mut rng, 10, 10, 0, 0.5);
        for reading_word in &vocab.reading {
            assert!(
                !vocab.calibration.iter().any(|c| c.id == reading_word.id),
                "{} appeared in both pools",
                reading_word.id
            );
        }
    }

    #[test]
    fn true_difficulty_finds_words_in_either_real_pool() {
        let mut rng = Rng::new(1);
        let vocab = generate(&mut rng, 3, 3, 0, 0.0);
        assert_eq!(
            vocab.true_difficulty("read-0000"),
            vocab.reading[0].true_difficulty
        );
        assert_eq!(
            vocab.true_difficulty("cal-0000"),
            vocab.calibration[0].true_difficulty
        );
    }

    #[test]
    fn generate_real_is_deterministic_from_its_seed() {
        let words = vec![
            "harbour".to_string(),
            "quay".to_string(),
            "gull".to_string(),
        ];
        let sourced: BTreeSet<String> = ["harbour".to_string()].into_iter().collect();
        let topics: BTreeSet<String> = ["sea".to_string()].into_iter().collect();
        let mut a = Rng::new(9);
        let mut b = Rng::new(9);
        let vocab_a = generate_real(&mut a, &words, &sourced, &topics, 4);
        let vocab_b = generate_real(&mut b, &words, &sourced, &topics, 4);
        assert_eq!(
            vocab_a
                .reading
                .iter()
                .map(|w| (w.id.clone(), w.true_difficulty, w.sourced_eligible))
                .collect::<Vec<_>>(),
            vocab_b
                .reading
                .iter()
                .map(|w| (w.id.clone(), w.true_difficulty, w.sourced_eligible))
                .collect::<Vec<_>>(),
        );
    }

    #[test]
    fn generate_real_makes_calibration_the_same_words_as_reading() {
        let words = vec!["harbour".to_string(), "quay".to_string()];
        let sourced: BTreeSet<String> = BTreeSet::new();
        let topics: BTreeSet<String> = BTreeSet::new();
        let mut rng = Rng::new(3);
        let vocab = generate_real(&mut rng, &words, &sourced, &topics, 0);
        assert_eq!(
            vocab.reading.iter().map(|w| &w.id).collect::<Vec<_>>(),
            vocab.calibration.iter().map(|w| &w.id).collect::<Vec<_>>(),
        );
    }

    #[test]
    fn generate_real_flags_sourced_eligible_from_the_sourced_set() {
        let words = vec!["harbour".to_string(), "quay".to_string()];
        let sourced: BTreeSet<String> = ["harbour".to_string()].into_iter().collect();
        let topics: BTreeSet<String> = BTreeSet::new();
        let mut rng = Rng::new(3);
        let vocab = generate_real(&mut rng, &words, &sourced, &topics, 0);
        let harbour = vocab.reading.iter().find(|w| w.id == "harbour").unwrap();
        let quay = vocab.reading.iter().find(|w| w.id == "quay").unwrap();
        assert!(harbour.sourced_eligible);
        assert!(!quay.sourced_eligible);
    }
}
