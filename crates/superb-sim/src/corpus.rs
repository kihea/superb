//! Loads the real content corpus — `content/passages`, `content/sources`,
//! `content/classes` — into the shapes `superb_core::composer` already
//! understands. Issue #35: M2 DONE item 3 gates on the simulator's session
//! battery run "against the live indexed corpus," and until this module
//! existed nothing loaded that corpus into the simulator at all — item 3
//! could not be run, only asserted.
//!
//! **Why this lives here and not in `superb-core`.** `superb_core::composer::compose`
//! never asks where a `Candidate` came from — the seam (`docs/seams.md` §Seam 2)
//! already treats disk content as reference data the host fetches and hands
//! over. Reading it from disk is exactly the boundary `library.rs`'s
//! synthetic generator already sits on (engine-contract §1: no I/O inside
//! `superb-core`); only the source of the candidates changes here, from
//! invented to real.
//!
//! **What this module does not decide.** Which candidate wins, which due
//! words a template's slots are filled with, whether a sourced excerpt
//! clears the coverage floor — every judgment stays inside
//! `superb_core::composer`, unchanged, exactly as it does for the synthetic
//! library. This module only turns JSON on disk into `Candidate`/`Slot`.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

use serde_json::Value;
use superb_core::composer::{Candidate, Pool, Slot};

/// Everything the real corpus offers: the composer's own candidates, the
/// word->class index a real shell would answer `wordClasses` with
/// (`docs/seams.md` §Seam 1), and the two word populations this crate's own
/// vocabulary builder (`vocabulary::generate_real`) and coverage instrument
/// (`due_list_coverage`) read.
#[derive(Debug, Clone)]
pub struct RealCorpus {
    pub composed: Vec<Candidate>,
    pub sourced: Vec<Candidate>,
    /// word -> every slot class it may fill, read straight from
    /// `content/classes/*.json`. A word absent from this map can never fill
    /// a composed slot; it can still be met through the sourced pool if it
    /// is in `sourced_words`, or not at all if it is in neither — which is
    /// itself a fact about the corpus this crate is built to report on, not
    /// a bug to route around.
    pub word_classes: BTreeMap<String, BTreeSet<String>>,
    /// Every word the corpus could plausibly teach: the union of every
    /// composed-fillable word (`word_classes`'s own keys) and every word a
    /// sourced excerpt claims in informative context (`sourced_words`).
    /// Sorted (a `BTreeSet` drained in order), so a caller assigning each
    /// one an invented `true_difficulty` from an `Rng` (`vocabulary::generate_real`)
    /// gets the same sequence on every run regardless of directory-listing
    /// order.
    pub reading_words: Vec<String>,
    /// The words at least one sourced excerpt claims to teach —
    /// `content/sources/*.json`'s own `words` fields, unioned.
    ///
    /// **The TRIPWIRE this set inherits.** `workspace/contract.md` item 5b:
    /// informative-context precision is measured at ≈44% (verifier-recomputed
    /// against real selection, not the 56% still written in some places).
    /// This set is what an excerpt *claims*, never what is measured to teach
    /// — used here only to decide which pool a word *could* be served from.
    /// Nothing in this crate schedules against it; that is exactly the line
    /// item 5b draws.
    pub sourced_words: BTreeSet<String>,
    /// Every `topic` value either content directory carries — the real
    /// analogue of `library::TOPICS`, for `vocabulary::generate_real`'s
    /// taste table.
    pub topics: BTreeSet<String>,
}

impl RealCorpus {
    /// Load the whole corpus from `content_root` (the directory holding
    /// `passages/`, `sources/`, `classes/`). Panics loudly on a malformed or
    /// missing file — a battery that silently skipped a bad excerpt would
    /// under-report the corpus it claims to measure.
    pub fn load(content_root: &Path) -> RealCorpus {
        let (composed, mut topics) = load_composed(&content_root.join("passages"));
        let (sourced, sourced_topics, sourced_words) = load_sourced(&content_root.join("sources"));
        topics.extend(sourced_topics);
        let word_classes = load_classes(&content_root.join("classes"));

        let mut reading: BTreeSet<String> = word_classes.keys().cloned().collect();
        reading.extend(sourced_words.iter().cloned());

        RealCorpus {
            composed,
            sourced,
            word_classes,
            reading_words: reading.into_iter().collect(),
            sourced_words,
            topics,
        }
    }

    /// For one due list, whether *some* sourced excerpt in the live corpus
    /// carries at least one of those words in informative context, and
    /// whether some excerpt carries at least two — directive 3's "band
    /// coverage... at both ≥1 and ≥2," read off the real due lists this
    /// crate's own battery produces rather than a separately sampled one.
    ///
    /// **Existence, not selection.** This answers whether the corpus *could*
    /// serve the due list from the sourced pool at all — the PR #34
    /// verifier's own "does some excerpt carry two simultaneously due
    /// words" question (`workspace/contract.md`'s "joint statistic") —
    /// independent of `sourced_preference`, backlog, or anything else that
    /// decides whether the composer actually *picks* it. Whether a word
    /// already appears elsewhere in `learner.words[..].context_frames` (the
    /// variation guarantee) is deliberately not checked here either: that
    /// guard is the engine's, and this instrument measures what the corpus
    /// offers, not what one particular learner has already used up.
    pub fn due_list_coverage(&self, due: &[String]) -> DueListCoverage {
        coverage_of(&self.sourced, due)
    }
}

/// [`RealCorpus::due_list_coverage`]'s own logic, over any sourced-pool
/// candidate slice rather than `self.sourced` specifically — so
/// `simulation.rs`'s session loop can compute the same statistic straight
/// off `World.library.sourced` (identical data, in real-corpus mode, to a
/// `RealCorpus`'s own `sourced` field, without threading a second reference
/// through every per-session helper).
pub fn coverage_of(sourced: &[Candidate], due: &[String]) -> DueListCoverage {
    if due.is_empty() {
        return DueListCoverage {
            at_least_1: false,
            at_least_2: false,
        };
    }
    let due_set: BTreeSet<&str> = due.iter().map(String::as_str).collect();
    let mut at_least_1 = false;
    let mut at_least_2 = false;
    for excerpt in sourced {
        let hits = excerpt
            .words
            .iter()
            .filter(|word| due_set.contains(word.as_str()))
            .count();
        if hits >= 1 {
            at_least_1 = true;
        }
        if hits >= 2 {
            at_least_2 = true;
            break; // both questions already answered true
        }
    }
    DueListCoverage {
        at_least_1,
        at_least_2,
    }
}

/// [`RealCorpus::due_list_coverage`]'s answer for one due list.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DueListCoverage {
    pub at_least_1: bool,
    pub at_least_2: bool,
}

/// Every `*.json` file directly inside `dir`, parsed and returned in
/// filename order — sorted explicitly rather than trusting `read_dir`'s own
/// order, which the platform does not guarantee, so the corpus loads the
/// same way on every machine this crate's determinism claim has to hold on.
/// `_seed.py` and any other non-`.json` file are skipped by the extension
/// check alone; no filename-prefix convention to keep in sync with content's
/// own.
fn read_json_files(dir: &Path) -> Vec<Value> {
    let mut paths: Vec<_> = fs::read_dir(dir)
        .unwrap_or_else(|e| panic!("read_dir({}): {e}", dir.display()))
        .map(|entry| entry.expect("dir entry is readable").path())
        .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("json"))
        .collect();
    paths.sort();
    paths
        .into_iter()
        .map(|path| {
            let text = fs::read_to_string(&path)
                .unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
            serde_json::from_str(&text).unwrap_or_else(|e| panic!("parse {}: {e}", path.display()))
        })
        .collect()
}

fn str_field<'a>(doc: &'a Value, field: &str, path_hint: &Path) -> &'a str {
    doc[field]
        .as_str()
        .unwrap_or_else(|| panic!("{}: missing or non-string `{field}`", path_hint.display()))
}

fn load_composed(dir: &Path) -> (Vec<Candidate>, BTreeSet<String>) {
    let mut topics = BTreeSet::new();
    let composed = read_json_files(dir)
        .into_iter()
        .map(|doc| {
            let id = str_field(&doc, "id", dir).to_string();
            let topic = str_field(&doc, "topic", dir).to_string();
            topics.insert(topic.clone());
            let slots = doc["slots"]
                .as_array()
                .unwrap_or_else(|| panic!("{id}: missing `slots`"))
                .iter()
                .map(|slot| Slot {
                    index: slot["index"]
                        .as_u64()
                        .unwrap_or_else(|| panic!("{id}: slot missing `index`"))
                        as u32,
                    class: slot["class"]
                        .as_str()
                        .unwrap_or_else(|| panic!("{id}: slot missing `class`"))
                        .to_string(),
                    default_word: slot["defaultWord"]
                        .as_str()
                        .unwrap_or_else(|| panic!("{id}: slot missing `defaultWord`"))
                        .to_string(),
                })
                .collect();
            Candidate {
                id,
                pool: Pool::Composed,
                slots,
                words: Vec::new(),
                topics: vec![topic],
            }
        })
        .collect();
    (composed, topics)
}

fn load_sourced(dir: &Path) -> (Vec<Candidate>, BTreeSet<String>, BTreeSet<String>) {
    let mut topics = BTreeSet::new();
    let mut sourced_words = BTreeSet::new();
    let sourced = read_json_files(dir)
        .into_iter()
        .map(|doc| {
            let id = str_field(&doc, "id", dir).to_string();
            let topic = str_field(&doc, "topic", dir).to_string();
            topics.insert(topic.clone());
            let words: Vec<String> = doc["words"]
                .as_array()
                .unwrap_or_else(|| panic!("{id}: missing `words`"))
                .iter()
                .map(|word| {
                    word.as_str()
                        .unwrap_or_else(|| panic!("{id}: a `words` entry is not a string"))
                        .to_string()
                })
                .collect();
            sourced_words.extend(words.iter().cloned());
            Candidate {
                id,
                pool: Pool::Sourced,
                slots: Vec::new(),
                words,
                topics: vec![topic],
            }
        })
        .collect();
    (sourced, topics, sourced_words)
}

fn load_classes(dir: &Path) -> BTreeMap<String, BTreeSet<String>> {
    let mut table: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for doc in read_json_files(dir) {
        let class_id = str_field(&doc, "id", dir).to_string();
        let members = doc["members"]
            .as_array()
            .unwrap_or_else(|| panic!("{class_id}: missing `members`"));
        for member in members {
            let word = member
                .as_str()
                .unwrap_or_else(|| panic!("{class_id}: a member is not a string"))
                .to_string();
            table.entry(word).or_default().insert(class_id.clone());
        }
    }
    table
}

/// The live `content/` directory, resolved the same way `src/bin/calibrate.rs`
/// already does — from `CARGO_MANIFEST_DIR`, not a relative path that would
/// depend on the caller's own working directory.
pub fn live_content_root() -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../content")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The live corpus, loaded once per test — counted rather than restated,
    /// same discipline `calibration.rs::live_corpus_counts` uses, so these
    /// numbers drift with the corpus instead of silently disagreeing with it.
    fn live() -> RealCorpus {
        RealCorpus::load(&live_content_root())
    }

    fn count_json(dir: &Path) -> usize {
        fs::read_dir(dir)
            .unwrap()
            .filter(|e| {
                e.as_ref()
                    .unwrap()
                    .path()
                    .extension()
                    .and_then(|ext| ext.to_str())
                    == Some("json")
            })
            .count()
    }

    #[test]
    fn loads_every_composed_passage_and_sourced_excerpt_on_disk() {
        let corpus = live();
        let passages = count_json(&live_content_root().join("passages"));
        let sources = count_json(&live_content_root().join("sources"));
        assert_eq!(corpus.composed.len(), passages);
        assert_eq!(corpus.sourced.len(), sources);
        assert!(
            corpus.composed.len() >= 40,
            "composed: {}",
            corpus.composed.len()
        );
        assert!(
            corpus.sourced.len() >= 2000,
            "sourced: {}",
            corpus.sourced.len()
        );
    }

    #[test]
    fn every_sourced_word_is_in_the_reading_vocabulary() {
        let corpus = live();
        for word in &corpus.sourced_words {
            assert!(
                corpus.reading_words.contains(word),
                "{word} is sourced-eligible but missing from reading_words"
            );
        }
    }

    #[test]
    fn every_composed_fillable_word_is_in_the_reading_vocabulary() {
        let corpus = live();
        for word in corpus.word_classes.keys() {
            assert!(
                corpus.reading_words.contains(word),
                "{word} has a class but is missing from reading_words"
            );
        }
    }

    #[test]
    fn reading_words_has_no_duplicates_and_is_sorted() {
        let corpus = live();
        let mut sorted = corpus.reading_words.clone();
        sorted.sort();
        sorted.dedup();
        assert_eq!(sorted, corpus.reading_words);
    }

    #[test]
    fn due_list_coverage_is_false_false_for_an_empty_due_list() {
        let corpus = live();
        let coverage = corpus.due_list_coverage(&[]);
        assert!(!coverage.at_least_1);
        assert!(!coverage.at_least_2);
    }

    #[test]
    fn due_list_coverage_finds_a_known_pair_in_one_excerpt() {
        let corpus = live();
        // Any real excerpt carrying >=2 words proves the ">=2" branch is
        // reachable against the live corpus at all — the same
        // falsifiability discipline the session battery itself is held to
        // (ADVISORY-007 §1): an instrument that can only ever read `false`
        // for ">=2" would be untested on its own most important branch.
        let pair = corpus
            .sourced
            .iter()
            .find(|excerpt| excerpt.words.len() >= 2)
            .expect("the live corpus has at least one excerpt with 2+ words");
        let coverage = corpus.due_list_coverage(&pair.words[..2]);
        assert!(coverage.at_least_1);
        assert!(coverage.at_least_2);
    }

    #[test]
    fn due_list_coverage_reads_false_for_words_no_excerpt_carries() {
        let corpus = live();
        let coverage = corpus.due_list_coverage(&[
            "zzz-not-a-real-corpus-word".to_string(),
            "zzz-also-not-one".to_string(),
        ]);
        assert!(!coverage.at_least_1);
        assert!(!coverage.at_least_2);
    }

    #[test]
    fn loading_is_deterministic() {
        let a = RealCorpus::load(&live_content_root());
        let b = RealCorpus::load(&live_content_root());
        assert_eq!(
            a.composed.iter().map(|c| &c.id).collect::<Vec<_>>(),
            b.composed.iter().map(|c| &c.id).collect::<Vec<_>>()
        );
        assert_eq!(
            a.sourced.iter().map(|c| &c.id).collect::<Vec<_>>(),
            b.sourced.iter().map(|c| &c.id).collect::<Vec<_>>()
        );
        assert_eq!(a.reading_words, b.reading_words);
    }
}
