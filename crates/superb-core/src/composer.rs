//! The composer: ADR-015's scoring function, where it belongs.
//!
//! **Why this file exists at all, said plainly.** BRIEF-014 built a simulator
//! that scored two pools and asserted the result. But that scoring lived in
//! `crates/superb-sim/src/composer.rs` — a stand-in that re-derived ADR-015
//! from the ADR, in the same brief that was testing it. A mechanism agreeing
//! with its own model looks exactly like validation and is not. This module
//! moves the rule into the engine, where the shipping path reads it, and the
//! simulator's job goes back to being what `docs/engine-contract.md` §6 always
//! said it was: the harness the composer is judged in.
//!
//! **What the composer decides, and what the host may not.** The host owns
//! reference data: it knows which passages exist, which words are in them, and
//! which semantic/POS class a word belongs to. It fetches those in answer to a
//! [`crate::engine::Needs`] and hands them over. Every judgment made from that
//! data happens here — which candidate wins, which due words a composed
//! passage's slots are filled with, and whether a sourced excerpt is good
//! enough to displace a scheduled encounter. `docs/architecture.md` §3: a shell
//! renders, gestures, persists, and times, and never decides.
//!
//! **The three parts and two guards are ADR-015's, unchanged.** Coverage is
//! concave (`coverage_decay^(i-1)`, so the sixth due word in a passage is worth
//! a fraction of the first, because passages carrying many targets read as
//! word-stuffing). Each word's value depends on its state and the pool it would
//! be met in (the affinity table). A `sourced_preference` multiplier carries
//! the answer that literature should win. The coverage floor keeps a two-word
//! sourced hit from being decoration that displaces a real encounter, and the
//! backlog override suspends the whole preference when the due list has grown
//! past what taste can afford — which is what makes the bounded-due-list
//! assertion provable rather than hoped for.
//!
//! **What this module adds that the stand-in could not.** The variation
//! guarantee (`docs/engine-contract.md` §4: no word reuses one of its previous
//! context frames). The stand-in explicitly deferred it — "the composer's
//! guard to keep, not this brief's," says `engine.rs`. It is kept here, per
//! word rather than per candidate: a passage a reader has met before is not
//! disqualified outright, it simply cannot serve *that* word again. Dropping
//! the whole candidate would have been easier and would have made a large,
//! good passage unusable forever because one of its words had been seen in it
//! once.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::learner::{LearnerState, Timestamp};
use crate::scheduler::{backlog_active, due_words};
use crate::state::WordState;
use crate::tuning::Tuning;

/// Which of ADR-009's two pools a passage is drawn from.
///
/// The distinction is not a data-source label — it changes what a word met in
/// the passage is worth. A composed passage is the better *teacher*; a sourced
/// excerpt is the better *confirmation*.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Pool {
    /// The authored slot library: a template whose slot points the composer
    /// fills. The only pool that can guarantee coverage of an arbitrary due
    /// set, which is why it carries the scheduling load.
    Composed,
    /// A curated public-domain excerpt. Fixed text — it cannot be composed to
    /// order, so it is selected opportunistically rather than requested.
    Sourced,
}

/// One fillable position in a composed passage template.
///
/// `default_word` is not a fallback in the apologetic sense: engine-contract
/// §4 requires "a real default word in every slot so an unfilled slot is
/// invisible." A reader must never be able to tell which words the app chose,
/// which is law 3 expressed as a data requirement rather than a style note.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Slot {
    /// Position in the passage template, and the order fills are rendered in.
    pub index: u32,
    /// The semantic/POS class this position accepts. A word may be filled here
    /// only if the host's class table lists this class for it.
    pub class: String,
    /// What stands here when the composer assigns nothing — a real word that
    /// reads naturally, never a placeholder.
    pub default_word: String,
}

/// One passage the host is offering for this request.
///
/// Both pools share a type because the score compares them directly. Which
/// fields carry meaning depends on `pool`: a composed candidate is defined by
/// its `slots`, a sourced one by the `words` it already contains in
/// informative context.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Candidate {
    /// The passage or excerpt id. This is the `frame_id` that will be logged
    /// against every word the passage serves, so it is also the key the
    /// variation guarantee is checked against.
    pub id: String,
    /// Which pool this candidate is drawn from.
    pub pool: Pool,
    /// Composed only: the positions this template exposes, in render order.
    /// Empty for a sourced excerpt, whose text is fixed.
    pub slots: Vec<Slot>,
    /// Sourced only: the words this excerpt contains *in informative context*
    /// — the host's index, not every word in the text. Empty for a composed
    /// template, whose words are decided here.
    pub words: Vec<String>,
}

/// What stands in one slot of the passage the host is about to render.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SlotFill {
    /// The slot this fills, matching [`Slot::index`].
    pub index: u32,
    /// The word to render. Either a due word the composer assigned or the
    /// slot's own default — and the reader cannot tell which, deliberately.
    pub word: String,
}

/// The passage the composer chose, ready to render.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Passage {
    /// The winning candidate's id — and the `frame_id` the host will report
    /// back on `PassageFinished`.
    pub id: String,
    /// Which pool it came from. The host does not act on this; it is here so a
    /// captured decision can be read back and explained.
    pub pool: Pool,
    /// Every slot, in index order, with the word that stands in it. Empty for
    /// a sourced excerpt: its text is fixed and there is nothing to fill.
    pub fills: Vec<SlotFill>,
    /// The due words this passage will actually serve, most valuable first.
    /// These are what the passage was chosen *for*, and the only words the
    /// score was computed over.
    pub targets: Vec<String>,
    /// Words the reader has never met, introduced into whatever slots the due
    /// list did not need (engine-contract §4: the composer's input is "the due
    /// list, **the target set** — the θ band").
    ///
    /// Kept separate from `targets` because they play a different part: a due
    /// word is a scheduled encounter and carries the score, a band word is
    /// first contact and carries none. Merging them would let a passage full
    /// of unknown words outscore one that actually served the schedule.
    pub seeded: Vec<String>,
}

impl Passage {
    /// Every tracked word this passage puts in front of the reader, in render
    /// order for the fills and value order for a sourced excerpt.
    ///
    /// This is what the host reports back in `PassageFinished { words_seen }`
    /// for the words that were read cleanly. It exists so a host never has to
    /// work out the union itself and get it subtly wrong — the composer knows
    /// exactly which words it put on the page.
    pub fn words_on_page(&self) -> Vec<String> {
        let mut all = self.targets.clone();
        all.extend(self.seeded.iter().cloned());
        all
    }
}

/// The reference data the host fetched in answer to a
/// [`crate::engine::Needs::PassageCandidates`].
///
/// A named type rather than loose arguments because it is exactly the payload
/// that crosses the FFI boundary, and because a captured one replays a
/// composer decision byte for byte.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ContentFrame {
    /// The passages the host is offering for this request.
    pub candidates: Vec<Candidate>,
    /// Which slot classes each word belongs to. Pure reference-data lookup:
    /// the host reports what its lexicon says and draws no conclusion from it.
    pub word_classes: BTreeMap<String, BTreeSet<String>>,
    /// Words inside the θ band the host's index says the reader has not met —
    /// the *target set* half of engine-contract §4's input, as opposed to the
    /// due list.
    ///
    /// Ordered by the host, best first, since which unknown words are worth
    /// introducing is a property of the corpus (frequency, how informative the
    /// contexts are) that lives in reference data and not in this crate. What
    /// the composer decides is *how many* get introduced and *where* — never
    /// whether the host's ranking was right.
    pub band_words: Vec<String>,
}

/// A word's value in one pool, per ADR-015's affinity table.
///
/// `Unseen` is scored with the `Seeded` row rather than being excluded. The
/// table has no `Unseen` line because ADR-015 was written about words already
/// met — but a record created by `engine::decide` starts `Unseen` and due
/// immediately, so the composer genuinely sees them. First contact is exactly
/// what the `Seeded` row describes (1.0 composed against 0.5 sourced: a word
/// that knows nothing is served by a context built to inform), so reusing it
/// is the answer the table already implies rather than a new judgment.
fn affinity(state: WordState, pool: Pool, tuning: &Tuning) -> f64 {
    let row = match state {
        WordState::Unseen | WordState::Seeded => tuning.affinity.seeded,
        WordState::Learning => tuning.affinity.learning,
        WordState::Consolidating => tuning.affinity.consolidating,
        WordState::Automatic => tuning.affinity.automatic,
    };
    match pool {
        Pool::Composed => row.composed,
        Pool::Sourced => row.sourced,
    }
}

/// The word's current state, `Unseen` for a word with no record — the same
/// convention `scheduler` and `engine` use, so "no history" means one thing
/// across the crate.
fn state_of(learner: &LearnerState, word: &str) -> WordState {
    learner
        .words
        .get(word)
        .map(|record| record.state)
        .unwrap_or(WordState::Unseen)
}

/// Whether `word` has already been served in `frame_id`.
///
/// engine-contract §4's variation guarantee, read off the log
/// `engine::decide` writes. Every logged frame counts, clean or not: the
/// guarantee is about the reader having met this word in this text before, and
/// a gloss tap means they certainly did.
fn already_met_in(learner: &LearnerState, word: &str, frame_id: &str) -> bool {
    learner.words.get(word).is_some_and(|record| {
        record
            .context_frames
            .iter()
            .any(|encounter| encounter.frame_id == frame_id)
    })
}

/// Sort words most-valuable-first for `pool`, so the concave decay lands on
/// the words that are actually worth the most — ADR-015's "`i` counting from
/// the most valuable," read literally.
///
/// Ties break on the word itself, alphabetically. Not cosmetic: the engine is
/// deterministic by contract (engine-contract §1), and a sort that left
/// equal-valued words in map order would make a golden vector depend on
/// insertion history.
fn by_value_desc(
    mut words: Vec<String>,
    pool: Pool,
    learner: &LearnerState,
    tuning: &Tuning,
) -> Vec<String> {
    words.sort_by(|a, b| {
        let value = |word: &str| affinity(state_of(learner, word), pool, tuning);
        value(b)
            .partial_cmp(&value(a))
            .expect("affinity values are finite by Tuning::validate")
            .then_with(|| a.cmp(b))
    });
    words
}

/// ADR-015's score for one candidate's covered words: the sum of
/// `coverage_decay^(i-1) * affinity(state_i, pool)`, multiplied by
/// `sourced_preference` when the pool is sourced.
///
/// `words` must already be most-valuable-first — [`by_value_desc`] does that,
/// and doing it here instead would hide an ordering decision inside an
/// arithmetic function.
fn score(words: &[String], pool: Pool, learner: &LearnerState, tuning: &Tuning) -> f64 {
    let mut total = 0.0;
    let mut decay = 1.0;
    for word in words {
        total += decay * affinity(state_of(learner, word), pool, tuning);
        decay *= tuning.coverage_decay;
    }
    if pool == Pool::Sourced {
        total *= tuning.sourced_preference;
    }
    total
}

/// One candidate, scored and resolved into the passage it would produce.
struct Scored {
    passage: Passage,
    score: f64,
    /// How many due words it covers. The backlog override compares on this
    /// and ignores `score` entirely — coverage, not taste.
    coverage: usize,
    /// How many tracked words it puts on the page at all, due or new. Only
    /// ever a tiebreak: between two passages the schedule values equally —
    /// including two that serve no due word at all — the one that shows the
    /// reader more is better.
    reach: usize,
}

/// Fill a composed template's slots from `due`.
///
/// Greedy, most-valuable word first, into the lowest free slot index whose
/// class that word carries. Greedy rather than optimal on purpose: with 5–8
/// slots and a due list the backlog guard keeps bounded, an exact assignment
/// buys a fraction of a point of score for a combinatorial search inside a
/// function that runs on every passage turn. Determinism is what matters here,
/// and greedy-over-a-sorted-list has it.
///
/// Every slot appears in the result — assigned ones with their due word, the
/// rest with `default_word`, so an unfilled slot is invisible (§4).
fn fill_slots(
    candidate: &Candidate,
    due: &[String],
    learner: &LearnerState,
    frame: &ContentFrame,
    tuning: &Tuning,
    backlogged: bool,
) -> Filled {
    let mut slots: Vec<&Slot> = candidate.slots.iter().collect();
    slots.sort_by_key(|slot| slot.index);

    let mut taken: BTreeMap<u32, String> = BTreeMap::new();

    let place = |word: &str, taken: &mut BTreeMap<u32, String>| -> bool {
        let Some(classes) = frame.word_classes.get(word) else {
            return false;
        };
        let open = slots
            .iter()
            .find(|slot| !taken.contains_key(&slot.index) && classes.contains(&slot.class));
        match open {
            Some(slot) => {
                taken.insert(slot.index, word.to_string());
                true
            }
            None => false,
        }
    };

    // **The schedule does not get the whole passage.** Slots are reserved for
    // new words *before* the due list is allowed to fill them, and that
    // ordering is the entire point rather than a detail. Filling due words
    // first and seeding into the remainder sounds equivalent and is not: in
    // steady state the due list is always longer than a passage, so there is
    // never a remainder, and a reader stops meeting new words the moment the
    // schedule gets busy. The simulator showed exactly that — vocabulary
    // growth stopped dead around session eight and the run spent the next
    // fifty sessions re-serving the same two dozen words.
    // ...and it does not get the whole passage *unless the reader is behind*.
    // A reservation that never yields introduces new words faster than the
    // schedule can carry them: two new words a passage against four due slots
    // is a promise to deliver twenty encounters a session out of six, and the
    // due list runs away — 31 words at sixty sessions became 85 at a hundred
    // and eighty. The backlog guard is already the engine's word for "the
    // reader is behind," so it is what suspends the reservation, and the two
    // together make a control loop: seeding stops when the schedule saturates
    // and resumes when it drains.
    let seedable: Vec<&String> = if backlogged {
        Vec::new()
    } else {
        frame
            .band_words
            .iter()
            .filter(|word| !learner.words.contains_key(*word))
            .collect()
    };
    let reserved = (tuning.seed_slots_per_passage as usize).min(seedable.len());
    let due_ceiling = slots.len().saturating_sub(reserved);

    let mut targets: Vec<String> = Vec::new();
    for word in by_value_desc(due.to_vec(), Pool::Composed, learner, tuning) {
        if targets.len() >= due_ceiling {
            break;
        }
        // The variation guarantee, per word: this passage may still be a fine
        // candidate for other words even though this one has met it before.
        if already_met_in(learner, &word, &candidate.id) {
            continue;
        }
        if place(&word, &mut taken) {
            targets.push(word);
        }
    }

    // Then whatever slots the schedule did not need, from the θ band — this
    // is the only way a word the reader has never met enters their vocabulary
    // through reading rather than through the deck. Taken in the host's own
    // order, which is the corpus's judgment about which unknown words are
    // worth introducing, not this crate's.
    let mut seeded: Vec<String> = Vec::new();
    for word in seedable {
        if taken.len() >= slots.len() || seeded.len() >= reserved {
            break;
        }
        if seeded.contains(word) {
            continue;
        }
        if place(word, &mut taken) {
            seeded.push(word.clone());
        }
    }

    // Anything the reservation left empty — because no band word fit a
    // remaining slot's class — goes back to the due list rather than rendering
    // a default. A reserved slot is a reservation, not a hole.
    for word in by_value_desc(due.to_vec(), Pool::Composed, learner, tuning) {
        if taken.len() >= slots.len() {
            break;
        }
        if targets.contains(&word) || already_met_in(learner, &word, &candidate.id) {
            continue;
        }
        if place(&word, &mut taken) {
            targets.push(word);
        }
    }

    let fills = slots
        .iter()
        .map(|slot| SlotFill {
            index: slot.index,
            word: taken
                .get(&slot.index)
                .cloned()
                .unwrap_or_else(|| slot.default_word.clone()),
        })
        .collect();

    // `targets` was built in value order already, so it is already the order
    // the concave score expects.
    Filled {
        fills,
        targets,
        seeded,
    }
}

/// What [`fill_slots`] worked out for one composed template.
struct Filled {
    fills: Vec<SlotFill>,
    targets: Vec<String>,
    seeded: Vec<String>,
}

/// Resolve one candidate into the passage it would produce and the score that
/// produces. `None` when the candidate cannot serve any due word at all —
/// there is nothing to choose between a passage that teaches nothing and no
/// passage — or, for a sourced excerpt, when it falls below the coverage
/// floor.
fn resolve(
    candidate: &Candidate,
    due: &[String],
    learner: &LearnerState,
    frame: &ContentFrame,
    tuning: &Tuning,
    backlogged: bool,
) -> Option<Scored> {
    match candidate.pool {
        Pool::Composed => {
            let filled = fill_slots(candidate, due, learner, frame, tuning, backlogged);
            // A passage that serves no due word is still worth reading if it
            // introduces one. This is not an edge case: it is a reader's first
            // day, when nothing is due and the app must still have something
            // to open with. Requiring a due word here made the engine unable
            // to start, which the simulator found by going idle for sixty
            // consecutive sessions.
            if filled.targets.is_empty() && filled.seeded.is_empty() {
                return None;
            }
            Some(Scored {
                coverage: filled.targets.len(),
                reach: filled.targets.len() + filled.seeded.len(),
                score: score(&filled.targets, Pool::Composed, learner, tuning),
                passage: Passage {
                    id: candidate.id.clone(),
                    pool: Pool::Composed,
                    fills: filled.fills,
                    targets: filled.targets,
                    seeded: filled.seeded,
                },
            })
        }
        Pool::Sourced => {
            let due_set: BTreeSet<&str> = due.iter().map(String::as_str).collect();
            let covered: Vec<String> = candidate
                .words
                .iter()
                .filter(|word| due_set.contains(word.as_str()))
                .filter(|word| !already_met_in(learner, word, &candidate.id))
                .cloned()
                .collect();
            let targets = by_value_desc(covered, Pool::Sourced, learner, tuning);

            // The coverage floor. Below it a sourced hit is decoration, and
            // decoration must not displace a scheduled encounter.
            if (targets.len() as u32) < tuning.min_sourced_coverage {
                return None;
            }
            Some(Scored {
                coverage: targets.len(),
                reach: targets.len(),
                score: score(&targets, Pool::Sourced, learner, tuning),
                passage: Passage {
                    id: candidate.id.clone(),
                    pool: Pool::Sourced,
                    fills: Vec::new(),
                    targets,
                    // A sourced excerpt is fixed text: there is no empty slot
                    // to introduce a band word into, so it never seeds.
                    seeded: Vec::new(),
                },
            })
        }
    }
}

/// Choose the passage this reader meets next.
///
/// Pure, like everything else in this crate: `now` is a parameter, the
/// candidates arrive from the host, and the same inputs always produce the
/// same passage. Returns `None` when nothing is due, or when no candidate can
/// serve a due word.
///
/// The backlog override is the one branch that ignores the score. Past
/// `backlog_override_due` waiting words, or `backlog_override_age_days` on the
/// oldest, the literature preference is suspended for this request and the
/// candidate covering the most due words wins outright. That is what keeps the
/// due list bounded under a preference strong enough to be worth having.
pub fn compose(
    learner: &LearnerState,
    frame: &ContentFrame,
    now: Timestamp,
    tuning: &Tuning,
) -> Option<Passage> {
    // Not `if due.is_empty() { return None }`. An empty due list is the
    // ordinary state of a reader who has just arrived, and a passage full of
    // words they have never met is exactly what should happen next.
    let due = due_words(learner, now);

    let backlogged = backlog_active(learner, now, tuning);
    let mut scored: Vec<Scored> = frame
        .candidates
        .iter()
        .filter_map(|candidate| resolve(candidate, &due, learner, frame, tuning, backlogged))
        .collect();
    if scored.is_empty() {
        return None;
    }

    // How often each candidate id already appears anywhere in this reader's
    // history. The variation guarantee stops a *word* repeating a context; this
    // stops the *reader* being walked through the library in id order, which is
    // what a bare alphabetical tiebreak does when every composed template scores
    // the same — and every composed template scores the same often, because
    // score is computed from the due words a template can hold, not from the
    // writing. Draining one passage before touching the next is not a schedule,
    // it is an artifact of sorting.
    let mut seen_count: BTreeMap<&str, usize> = BTreeMap::new();
    for record in learner.words.values() {
        for encounter in &record.context_frames {
            *seen_count.entry(encounter.frame_id.as_str()).or_insert(0) += 1;
        }
    }
    let freshness = |id: &str| seen_count.get(id).copied().unwrap_or(0);

    scored.sort_by(|a, b| {
        let by_score = || {
            b.score
                .partial_cmp(&a.score)
                .expect("scores are finite: every term is a validated tuning constant")
        };
        // Suspending the preference is not the same as choosing arbitrarily:
        // under backlog, coverage leads and the score is only a tiebreak among
        // candidates that cover equally.
        let by_freshness_then_id = || {
            b.reach
                .cmp(&a.reach)
                .then_with(|| freshness(&a.passage.id).cmp(&freshness(&b.passage.id)))
                .then_with(|| a.passage.id.cmp(&b.passage.id))
        };
        if backlogged {
            b.coverage
                .cmp(&a.coverage)
                .then_with(by_score)
                .then_with(by_freshness_then_id)
        } else {
            by_score().then_with(by_freshness_then_id)
        }
    });

    scored.into_iter().next().map(|winner| winner.passage)
}
