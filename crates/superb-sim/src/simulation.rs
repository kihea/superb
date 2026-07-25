//! One synthetic learner's whole run: sixty sessions of calibration and
//! reading, driven entirely through `superb_core::{plan, decide}` — the same
//! surface a real host uses (engine-contract §2). Nothing in this module
//! calls anything on `superb_core::engine` that a real host could not also
//! call.
//!
//! **The boundary this module holds.** This is the *host* half of the
//! simulator, not the oracle. It reads `learner.words`, `due_words`, and
//! `backlog_active` freely — a host always can, and a real composer will
//! need to (`src/composer.rs`). The one thing it never does is let that
//! information leak into a response decision: every `knew` a `DeckSwipe`
//! carries and every clean/gloss-tap split a passage produces comes from
//! `src/oracle.rs`, called with `true_theta` and a word's own
//! `true_difficulty` — never with anything read off `learner`.

use std::collections::{BTreeMap, BTreeSet};

use superb_core::signals::Event;
use superb_core::state::WordState;
use superb_core::{Effect, Frame, LearnerState, Needs, Request, Timestamp, Tuning};
use superb_core::{decide, due_words, plan};

use crate::library::{Library, band_words, word_classes};
use crate::oracle::{claims_pseudoword, knows_real_item, knows_real_item_after};
use crate::rng::Rng;
use crate::vocabulary::{Vocabulary, generate};
use superb_core::composer::{ContentFrame, Pool};

const MILLIS_PER_DAY: u64 = 24 * 60 * 60 * 1000;

/// Every knob a synthetic run is parameterized on, gathered in one place so
/// a run is fully reproduced by `(seed, true_theta, config)` alone.
#[derive(Debug, Clone, Copy)]
pub struct SimConfig {
    pub sessions: usize,
    pub reading_vocabulary_size: usize,
    pub calibration_pool_size: usize,
    pub pseudoword_pool_size: usize,
    pub sourced_eligible_rate: f64,
    /// Real-word calibration draws per session. One, not several: this
    /// keeps a sixty-session run's total evidence comparable to what a real
    /// reader would actually generate in that many sittings — see
    /// `report.rs`'s own note on Assertion 1 for what BRIEF-014 round 1
    /// found when `theta_se` was a decayed number rather than one derived
    /// from accumulated Fisher information (`ability::update_theta`'s own
    /// doc comment, amended in round 2).
    pub calibration_items_per_session: usize,
    /// Fraction of calibration draws that are a real word rather than a
    /// pseudoword.
    pub calibration_real_rate: f64,
    /// How many pseudoword claims are dishonest, for the "ordinary" runs
    /// (Assertions 1, 2, 3, 5). Small and nonzero — pseudowords are ordinary
    /// background evidence here, not the mechanism under test. Assertion 4
    /// overrides this explicitly with `0.0` and `1.0`.
    pub overclaim_rate: f64,
    pub composed_cap: usize,
    pub sourced_cap: usize,
    pub session_length_days: f64,
}

impl Default for SimConfig {
    fn default() -> Self {
        Self {
            // Six months of daily reading, not two.
            //
            // engine-contract §5 said sixty, and sixty was right for a
            // simulator whose stand-in composer never introduced a word: the
            // vocabulary was fixed, so every session went to consolidating the
            // same two dozen words and they matured fast. With a real composer
            // reserving slots for new vocabulary, a word competes for
            // encounters with everything else the reader has met, and reaching
            // ten distinct clean contexts takes a season rather than a month.
            // ADVISORY-005 named "a longer horizon at fixed seeds" as the
            // measurement M2 owed anyway; this is it, taken early because the
            // composer forced the question.
            sessions: 180,
            reading_vocabulary_size: 240,
            calibration_pool_size: 40,
            pseudoword_pool_size: 40,
            sourced_eligible_rate: 0.35,
            calibration_items_per_session: 1,
            calibration_real_rate: 0.7,
            overclaim_rate: 0.05,
            composed_cap: 6,
            sourced_cap: 3,
            session_length_days: 1.0,
        }
    }
}

/// Which pool won each session that had at least one due word — a tally
/// used to confirm Assertion 5 actually exercised the sourced path, not just
/// left it configured and idle.
#[derive(Debug, Clone, Copy, Default)]
pub struct PoolTally {
    pub composed_sessions: usize,
    pub sourced_sessions: usize,
    pub idle_sessions: usize,
}

/// Everything one full run produced, for `report.rs` to read the five
/// assertions off without re-deriving them from raw effects.
#[derive(Debug, Clone)]
pub struct SimulationOutcome {
    pub seed: u64,
    pub true_theta: f64,
    pub final_theta: f64,
    pub final_theta_se: f64,
    /// The due list's size at the *start* of each session, before that
    /// session's own calibration or passage changes it — one entry per
    /// session, in order.
    pub due_list_sizes: Vec<usize>,
    /// One entry per word, the first time it reached `AUTOMATIC`: the total
    /// number of distinct context frames (`WordRecord::context_frames.len()`
    /// at that moment) it took — clean and gloss-tapped alike, since both
    /// are a "varied-context encounter" the word was met through, and only
    /// the clean ones count toward the engine's own progression threshold.
    /// See `report.rs` for why this reading, not the engine's internal
    /// distinct-clean-frame count, is what Assertion 2 reports.
    pub encounters_to_automatic: Vec<usize>,
    pub pools: PoolTally,
    /// How many words ended the run in each `WordState`, in declaration order:
    /// Unseen, Seeded, Learning, Consolidating, Automatic.
    ///
    /// Not an assertion of its own — a diagnostic. Every assertion that has
    /// ever failed in this crate failed because words were piling up at one
    /// state, and reading that off a histogram takes a second where reading it
    /// off `encounters_to_automatic: []` takes an afternoon.
    pub state_histogram: [usize; 5],
}

/// The read-only world a run's every session shares: the synthetic
/// vocabulary, the tuning under test, the candidate library, and the run's own
/// config — bundled so the per-session helpers below take one reference
/// instead of five (`clippy::too_many_arguments`'s own threshold, the same
/// reason `superb_core::engine::Ctx` exists).
///
/// It no longer carries ADR-015's extracted constants. It used to, because the
/// stand-in composer scored with them; the engine reads them from `Tuning`
/// itself now, and a host holding a copy of the engine's constants is exactly
/// the shape that let the two disagree unnoticed.
struct World<'a> {
    vocabulary: &'a Vocabulary,
    tuning: &'a Tuning,
    config: &'a SimConfig,
    /// The fixed candidate library this run offers the engine's composer.
    library: &'a Library,
    /// Every reading word in the one synthetic slot class, built once.
    word_classes: BTreeMap<String, BTreeSet<String>>,
}

/// Everything one session's helpers accumulate across the whole run,
/// bundled for the same reason as [`World`].
#[derive(Default)]
struct RunState {
    pools: PoolTally,
    /// How many times this host has served each word in a passage the reader
    /// read cleanly. The oracle's exposure input — the host's own record of
    /// what it showed, never anything read off `LearnerState`.
    clean_exposures: BTreeMap<String, usize>,
    encounters_to_automatic: Vec<usize>,
    already_recorded_automatic: BTreeMap<String, ()>,
}

/// Run one synthetic learner's whole simulation and return everything
/// `report.rs` needs. Deterministic in `seed` and `true_theta` — nothing
/// else varies the output.
pub fn run(seed: u64, true_theta: f64, config: &SimConfig) -> SimulationOutcome {
    let mut rng = Rng::new(seed);
    let vocabulary = generate(
        &mut rng,
        config.reading_vocabulary_size,
        config.calibration_pool_size,
        config.pseudoword_pool_size,
        config.sourced_eligible_rate,
    );
    let tuning = Tuning::default();
    // Built from the same `rng` the rest of the run draws from, before any
    // session runs: the library is part of the world, so it must be fixed by
    // the seed like everything else.
    let library = Library::build(
        &mut rng,
        &vocabulary,
        config.composed_cap,
        config.sourced_cap,
    );
    let world = World {
        vocabulary: &vocabulary,
        tuning: &tuning,
        config,
        library: &library,
        word_classes: word_classes(&vocabulary),
    };

    let mut learner = LearnerState::new(
        seed,
        0,
        0.0,
        tuning.theta_prior_information(),
        BTreeMap::new(),
        BTreeMap::new(),
    );
    let mut due_list_sizes = Vec::with_capacity(config.sessions);
    let mut state = RunState::default();
    let session_millis = (config.session_length_days * MILLIS_PER_DAY as f64) as u64;

    for session_index in 0..config.sessions {
        let now = Timestamp::from_millis_since_epoch(session_millis * session_index as u64);

        due_list_sizes.push(due_words(&learner, now).len());

        run_calibration(&mut learner, &mut rng, &world, now, true_theta);
        run_reading_session(
            &mut learner,
            &mut rng,
            &world,
            &mut state,
            now,
            session_index,
            true_theta,
        );
    }

    SimulationOutcome {
        seed,
        true_theta,
        final_theta: learner.theta(),
        final_theta_se: learner.theta_se(),
        due_list_sizes,
        encounters_to_automatic: state.encounters_to_automatic,
        pools: state.pools,
        state_histogram: learner.words.values().fold([0; 5], |mut counts, record| {
            let slot = match record.state {
                WordState::Unseen => 0,
                WordState::Seeded => 1,
                WordState::Learning => 2,
                WordState::Consolidating => 3,
                WordState::Automatic => 4,
            };
            counts[slot] += 1;
            counts
        }),
    }
}

/// One session's calibration draws: `DeckSwipe` events, real words and
/// pseudowords mixed, every response coming from [`crate::oracle`] and
/// nothing else.
fn run_calibration(
    learner: &mut LearnerState,
    rng: &mut Rng,
    world: &World,
    now: Timestamp,
    true_theta: f64,
) {
    for _ in 0..world.config.calibration_items_per_session {
        let is_pseudoword = !rng.chance(world.config.calibration_real_rate);
        let (item_id, knew) = if is_pseudoword {
            let index = rng.below(world.vocabulary.pseudowords.len());
            let item_id = world.vocabulary.pseudowords[index].clone();
            let knew = claims_pseudoword(rng, world.config.overclaim_rate);
            (item_id, knew)
        } else {
            let index = rng.below(world.vocabulary.calibration.len());
            let word = &world.vocabulary.calibration[index];
            let knew = knows_real_item(rng, true_theta, word.true_difficulty);
            (word.id.clone(), knew)
        };

        dispatch_deck_swipe(
            learner,
            world.vocabulary,
            world.tuning,
            now,
            item_id,
            is_pseudoword,
            knew,
        );
    }
}

/// Turn one calibration draw into a `DeckSwipe` event and drive it through
/// `plan`/`decide`, exactly the two-step pattern engine-contract §2 draws —
/// answering `Needs::ItemDifficulty` from `vocabulary`'s own data, the
/// host's, never the engine's. Shared by [`run_calibration`] and
/// `pseudoword_comparison`'s twin-learner replay, which needs the identical
/// dispatch both learners go through.
pub(crate) fn dispatch_deck_swipe(
    learner: &mut LearnerState,
    vocabulary: &Vocabulary,
    tuning: &Tuning,
    now: Timestamp,
    item_id: String,
    is_pseudoword: bool,
    knew: bool,
) {
    let request = Request::ProcessEvent(Event::DeckSwipe {
        item_id: item_id.clone(),
        is_pseudoword,
        knew,
    });
    let needs = plan(learner, &request, now, tuning);
    let frame = match needs {
        Needs::Nothing => Frame::Nothing,
        Needs::ItemDifficulty { item_id } => Frame::ItemDifficulty {
            difficulty: vocabulary.true_difficulty(&item_id),
        },
        // A DeckSwipe never asks for candidates. Enumerated rather than
        // wildcarded so a new Needs variant has to be answered here, not
        // silently dropped into Frame::Nothing.
        Needs::PassageCandidates { .. } => {
            unreachable!("a DeckSwipe never asks for passage candidates")
        }
    };
    let _ = decide(learner, request, frame, now, tuning);
}

/// One session's reading, driven entirely through `superb_core::{plan,
/// decide}` — including the choice of what to read.
///
/// **This is the function BRIEF-015 exists to change.** It used to call a
/// stand-in composer in this crate, which meant Assertion 5 measured the
/// simulator's reading of ADR-015 rather than the engine's. Now it does what a
/// real host does and nothing more: answer `Needs::PassageCandidates` from its
/// content index (`src/library.rs`), hand the answer back, and render whatever
/// `Effect::PassageComposed` names. Every judgment in the round trip belongs to
/// `superb_core::composer`.
///
/// The oracle then decides which of the chosen passage's target words were
/// recognised cleanly and which needed a gloss tap, and the whole thing is
/// dispatched as one `PassageFinished` plus zero or more `GlossTap` events
/// sharing the passage's own id as their frame id.
///
/// A composed passage's *unassigned* slots carry the template's own filler
/// words, which are never target words and never enter the schedule — the
/// simulator no longer injects new vocabulary through them. New words now
/// arrive the one way a real reader meets them, through calibration
/// (`run_calibration`), which is also what makes the due list's growth an
/// honest measurement rather than a function of how many slots happened to be
/// empty.
fn run_reading_session(
    learner: &mut LearnerState,
    rng: &mut Rng,
    world: &World,
    state: &mut RunState,
    now: Timestamp,
    _session_index: usize,
    true_theta: f64,
) {
    let request = Request::NextPassage;
    let needs = plan(learner, &request, now, world.tuning);

    // The host answers the need from its index. `band_low`/`band_high` are
    // ignored here because the synthetic vocabulary has no notion of a word
    // being too hard to appear in a passage — the oracle models difficulty at
    // the moment of reading instead. A real host would filter on them.
    let Needs::PassageCandidates {
        due_words,
        band_low,
        band_high,
    } = &needs
    else {
        panic!("NextPassage must ask for candidates, got {needs:?}");
    };
    if due_words.is_empty() {
        state.pools.idle_sessions += 1;
        return;
    }

    let mut candidates = world.library.composed.clone();
    candidates.extend(world.library.sourced.iter().cloned());
    let content = ContentFrame {
        candidates,
        word_classes: world.word_classes.clone(),
        band_words: band_words(world.vocabulary, learner, *band_low, *band_high),
    };

    let outcome = decide(learner, request, Frame::Content(content), now, world.tuning);

    let Some(passage) = outcome.effects.iter().find_map(|effect| match effect {
        Effect::PassageComposed { passage } => Some(passage.clone()),
        _ => None,
    }) else {
        // Due words existed but no candidate could serve any of them — the
        // variation guarantee having exhausted this word's contexts is the
        // realistic cause, and it is a content shortage, not an idle reader.
        state.pools.idle_sessions += 1;
        return;
    };

    match passage.pool {
        Pool::Composed => state.pools.composed_sessions += 1,
        Pool::Sourced => state.pools.sourced_sessions += 1,
    }
    let frame_id = passage.id.clone();

    // Every tracked word the passage actually puts in front of the reader —
    // not just the ones the composer aimed at. A composed template's
    // unassigned slots still render real vocabulary, and that is how a word
    // is met for the first time; a sourced excerpt's indexed words are met
    // whether or not they were due. Reporting only the targets would model a
    // reader who somehow reads past every word the app was not testing them
    // on, and it would make law 1 — the schedule is the pedagogy, the surface
    // is just reading — false inside the simulator.
    // `words_on_page` is the composer's own answer to "what did you put in
    // front of the reader" — due words it aimed at, plus band words it
    // introduced. The host does not recompute it from the fills, because the
    // fills also contain untracked prose the schedule has no opinion about.
    let words_on_screen = passage.words_on_page();

    let mut clean_words = Vec::new();
    let mut gloss_words = Vec::new();
    for word in &words_on_screen {
        let difficulty = world.vocabulary.true_difficulty(word);
        let exposures = state.clean_exposures.get(word).copied().unwrap_or(0);
        if knows_real_item_after(rng, true_theta, difficulty, exposures) {
            clean_words.push(word.clone());
            *state.clean_exposures.entry(word.clone()).or_insert(0) += 1;
        } else {
            gloss_words.push(word.clone());
        }
    }

    for word in &gloss_words {
        let request = Request::ProcessEvent(Event::GlossTap {
            word: word.clone(),
            passage: frame_id.clone(),
            position: 0,
        });
        // GlossTap never asks for a Frame (`plan`'s own match arm) — Needs::Nothing.
        let _ = decide(learner, request, Frame::Nothing, now, world.tuning);
    }

    let request = Request::ProcessEvent(Event::PassageFinished {
        passage: frame_id,
        words_seen: clean_words,
    });
    let outcome = decide(learner, request, Frame::Nothing, now, world.tuning);

    for effect in &outcome.effects {
        if let Effect::WordStateChanged {
            word,
            to: WordState::Automatic,
            ..
        } = effect
        {
            if state
                .already_recorded_automatic
                .insert(word.clone(), ())
                .is_none()
            {
                let encounters = learner
                    .words
                    .get(word)
                    .map(|record| record.context_frames.len())
                    .unwrap_or(0);
                state.encounters_to_automatic.push(encounters);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_run_is_deterministic_from_its_seed() {
        let config = SimConfig {
            sessions: 10,
            ..SimConfig::default()
        };
        let a = run(42, 0.5, &config);
        let b = run(42, 0.5, &config);
        assert_eq!(a.final_theta, b.final_theta);
        assert_eq!(a.final_theta_se, b.final_theta_se);
        assert_eq!(a.due_list_sizes, b.due_list_sizes);
        assert_eq!(a.encounters_to_automatic, b.encounters_to_automatic);
    }

    #[test]
    fn different_seeds_produce_different_runs() {
        let config = SimConfig {
            sessions: 10,
            ..SimConfig::default()
        };
        let a = run(1, 0.5, &config);
        let b = run(2, 0.5, &config);
        assert!(a.final_theta != b.final_theta || a.due_list_sizes != b.due_list_sizes);
    }

    #[test]
    fn theta_never_leaves_its_clamp_range_over_a_run() {
        let tuning = Tuning::default();
        let config = SimConfig::default();
        let outcome = run(7, -3.9, &config);
        assert!(outcome.final_theta >= tuning.theta_min());
        assert!(outcome.final_theta <= tuning.theta_max());
    }

    #[test]
    fn the_due_list_is_recorded_once_per_session() {
        let config = SimConfig {
            sessions: 15,
            ..SimConfig::default()
        };
        let outcome = run(3, 0.0, &config);
        assert_eq!(outcome.due_list_sizes.len(), 15);
    }
}
