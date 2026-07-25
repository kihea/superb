//! The synthetic passage library the simulator offers the *real* composer.
//!
//! **What changed, and why it is the whole point of this module.** BRIEF-014
//! shipped `src/composer.rs`: a stand-in that re-implemented ADR-015's scoring
//! and picked a winner itself. Assertion 5 therefore measured the simulator's
//! reading of ADR-015, not the engine's — a mechanism agreeing with its own
//! model, which is indistinguishable from validation right up until the two
//! disagree. That module is gone. This one replaces it with the only thing a
//! host is actually entitled to do: **offer candidates**. Every judgment —
//! which candidate wins, which due words fill which slots, whether a sourced
//! excerpt clears the floor — now happens inside
//! `superb_core::composer::compose`.
//!
//! **Why the library is fixed rather than generated per session.** The old
//! stand-in minted a fresh `frame_id` every session (`sess-00017-composed`),
//! which meant engine-contract §4's variation guarantee — *no word reuses one
//! of its previous context frames* — could never bind: every context was new
//! by construction. A real reader meets a finite library, so this one is
//! finite too. That makes the guarantee load-bearing in the simulation, which
//! is the only place it can be measured before real readers exist.

use crate::rng::Rng;
use crate::vocabulary::Vocabulary;
use superb_core::composer::{Candidate, Pool, Slot};

/// The one slot class the synthetic vocabulary carries.
///
/// The simulator has no semantics — its "words" are ids with a difficulty —
/// so every word fits every slot. That is a deliberate simplification, not an
/// oversight: slot-class compatibility is a *content* property, tested by the
/// content pipeline against real classes, and modelling it with invented
/// classes here would measure the invention. What the simulator is for is the
/// schedule, and the schedule does not care what part of speech a word is.
pub const CLASS: &str = "any";

/// How many composed templates the library holds.
///
/// engine-contract §4 sizes the real authored library at "~150 passages across
/// ~12 topic clusters." Matching it matters because it bounds how many
/// distinct contexts a word can be met in before the variation guarantee
/// starves it — with `encounter_target` at 10, 150 is comfortable, and a
/// simulator run that quietly ran out of contexts would look like a scheduling
/// failure rather than a content shortage.
pub const COMPOSED_PASSAGES: usize = 150;

/// How many sourced excerpts the library holds.
///
/// Larger than the composed library, and that asymmetry is the point of
/// ADR-009 rather than a contradiction of it. Sourced text cannot be composed
/// to order — an excerpt covers the words it happens to contain — so the only
/// way a sourced pool ever covers a due list is by being *big*. A curated
/// public-domain corpus indexed by word yields far more than this; 400 is
/// deliberately conservative.
///
/// This number was found, not chosen. At 40 the sourced pool was never once
/// selected across three seeds and sixty sessions: with `min_sourced_coverage`
/// at 2, an excerpt has to contain two words that are due *right now*, and a
/// small library almost never does. That is worth stating plainly because it
/// is a real product constraint hiding in a constant — the literature
/// preference is unspendable until the sourced corpus is large, no matter what
/// `sourced_preference` is set to.
pub const SOURCED_EXCERPTS: usize = 400;

/// A fixed library of candidates, built once per run from the run's own seed.
#[derive(Debug, Clone)]
pub struct Library {
    /// Composed templates, each with `composed_cap` empty slots.
    pub composed: Vec<Candidate>,
    /// Sourced excerpts, each carrying a fixed set of sourced-eligible words.
    pub sourced: Vec<Candidate>,
}

impl Library {
    /// Build the library for one run.
    ///
    /// Composed templates are interchangeable — same slot count, same class,
    /// different ids. That is honest: the simulator cannot model what makes
    /// one authored passage better than another, so it models the one property
    /// the engine actually reads, which is that they are *distinct contexts*.
    ///
    /// Sourced excerpts are not interchangeable. Each is given a random draw
    /// of `sourced_cap` words from the sourced-eligible vocabulary, so which
    /// excerpts are available for a given due list is a real constraint rather
    /// than a formality — this is what stops the sourced pool from behaving
    /// like a composed pool with a multiplier attached.
    pub fn build(
        rng: &mut Rng,
        vocabulary: &Vocabulary,
        composed_cap: usize,
        sourced_cap: usize,
    ) -> Library {
        let composed = (0..COMPOSED_PASSAGES)
            .map(|index| Candidate {
                id: format!("comp-{index:04}"),
                pool: Pool::Composed,
                slots: (0..composed_cap as u32)
                    .map(|slot| Slot {
                        index: slot,
                        class: CLASS.to_string(),
                        // Every slot carries a real default so an unfilled one
                        // is invisible (engine-contract §4). The simulator's
                        // defaults are outside the tracked vocabulary on
                        // purpose: a real composed passage is 120–220 words of
                        // which only 5–8 are targets, and the rest is ordinary
                        // prose the schedule has no opinion about. Making the
                        // defaults tracked words would model a passage that is
                        // nothing but targets, which is the word-stuffing §4
                        // exists to forbid.
                        default_word: format!("filler-{index:04}-{slot}"),
                    })
                    .collect(),
                words: Vec::new(),
            })
            .collect();

        let eligible: Vec<&str> = vocabulary
            .reading
            .iter()
            .filter(|word| word.sourced_eligible)
            .map(|word| word.id.as_str())
            .collect();

        let sourced = (0..SOURCED_EXCERPTS)
            .map(|index| {
                let mut words: Vec<String> = Vec::new();
                // Sample without replacement within one excerpt: a real
                // excerpt does not list the same word twice as a target.
                while words.len() < sourced_cap && words.len() < eligible.len() {
                    let pick = eligible[rng.below(eligible.len())].to_string();
                    if !words.contains(&pick) {
                        words.push(pick);
                    }
                }
                words.sort();
                Candidate {
                    id: format!("src-{index:04}"),
                    pool: Pool::Sourced,
                    slots: Vec::new(),
                    words,
                }
            })
            .collect();

        Library { composed, sourced }
    }
}

/// The `word_classes` table the composer needs: every reading word in the one
/// synthetic class.
///
/// Built once per run rather than per session — it never changes, and rebuilding
/// it 60 times would put allocation noise into a determinism test that exists
/// to catch real drift.
pub fn word_classes(
    vocabulary: &Vocabulary,
) -> std::collections::BTreeMap<String, std::collections::BTreeSet<String>> {
    // Both real-word pools, not just the reading one. A calibration word is
    // scheduled the moment its `DeckSwipe` lands (`engine::decide_deck_swipe`),
    // so it joins the due list and has to be servable somewhere — a word the
    // schedule keeps asking for and no passage can hold is a due list that only
    // grows.
    vocabulary
        .reading
        .iter()
        .chain(vocabulary.calibration.iter())
        .map(|word| {
            (
                word.id.clone(),
                std::collections::BTreeSet::from([CLASS.to_string()]),
            )
        })
        .collect()
}

/// The words the host offers as the θ band half of the composer's target set
/// (engine-contract §4).
///
/// A real host reads this off a frequency-and-difficulty index. This one has
/// ground-truth difficulty to hand, which would be cheating if it used it to
/// decide anything — so it does not: it filters to the band the engine asked
/// for and orders by difficulty ascending, which is the same "easiest useful
/// word first" ordering a frequency-ranked corpus index would produce. What is
/// deliberately *not* consulted is `true_theta`. The band's edges came from
/// `plan`, computed from θ̂, and the host never learns whether θ̂ is right.
pub fn band_words(
    vocabulary: &Vocabulary,
    learner: &superb_core::LearnerState,
    band_low: f64,
    band_high: f64,
) -> Vec<String> {
    let mut in_band: Vec<&crate::vocabulary::WordSpec> = vocabulary
        .reading
        .iter()
        .filter(|word| !learner.words.contains_key(&word.id))
        .filter(|word| word.true_difficulty >= band_low && word.true_difficulty <= band_high)
        .collect();
    in_band.sort_by(|a, b| {
        a.true_difficulty
            .partial_cmp(&b.true_difficulty)
            .expect("difficulties are finite")
            .then_with(|| a.id.cmp(&b.id))
    });
    in_band.into_iter().map(|word| word.id.clone()).collect()
}
