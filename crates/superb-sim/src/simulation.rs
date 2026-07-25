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

use std::collections::BTreeMap;

use superb_core::signals::Event;
use superb_core::state::WordState;
use superb_core::{Effect, Frame, LearnerState, Needs, Request, Timestamp, Tuning};
use superb_core::{decide, due_words, plan};

use crate::composer::choose_passage;
use crate::oracle::{claims_pseudoword, knows_real_item};
use crate::rng::Rng;
use crate::tuning_extract::{AdrConstants, Pool};
use crate::vocabulary::{Vocabulary, generate};

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
            sessions: 60,
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
}

/// The read-only world a run's every session shares: the synthetic
/// vocabulary, the tuning under test, its ADR-015 constants already
/// extracted (`tuning_extract`), and the run's own config — bundled so the
/// per-session helpers below take one reference instead of four
/// (`clippy::too_many_arguments`'s own threshold, the same reason
/// `superb_core::engine::Ctx` exists).
struct World<'a> {
    vocabulary: &'a Vocabulary,
    tuning: &'a Tuning,
    constants: &'a AdrConstants,
    config: &'a SimConfig,
}

/// Everything one session's helpers accumulate across the whole run,
/// bundled for the same reason as [`World`].
#[derive(Default)]
struct RunState {
    next_new_word_index: usize,
    pools: PoolTally,
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
    let constants = AdrConstants::from_tuning(&tuning);
    let world = World {
        vocabulary: &vocabulary,
        tuning: &tuning,
        constants: &constants,
        config,
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
    let needs = plan(learner, &request, now);
    let frame = match needs {
        Needs::Nothing => Frame::Nothing,
        Needs::ItemDifficulty { item_id } => Frame::ItemDifficulty {
            difficulty: vocabulary.true_difficulty(&item_id),
        },
    };
    let _ = decide(learner, request, frame, now, tuning);
}

/// One session's reading: the composer stub picks a passage
/// (`src/composer.rs`), the oracle decides which of its due words were
/// recognised cleanly and which needed a gloss tap, and the whole thing is
/// dispatched as one `PassageFinished` plus zero or more `GlossTap` events
/// sharing that passage's frame id.
///
/// A composed passage's unfilled slots are filled with brand-new vocabulary,
/// in vocabulary order, tracked by `state.next_new_word_index` — the only
/// path new words enter the simulation, mirroring `state.rs`'s own "met
/// once, in the onboarding deck or a first passage." A brand-new word is
/// never gloss-tapped on its first meeting: first contact is presentation,
/// not assessment (`WordState::Seeded`'s own doc comment — "nothing is known
/// yet about whether it stuck").
fn run_reading_session(
    learner: &mut LearnerState,
    rng: &mut Rng,
    world: &World,
    state: &mut RunState,
    now: Timestamp,
    session_index: usize,
    true_theta: f64,
) {
    let Some(passage) = choose_passage(
        learner,
        now,
        world.tuning,
        world.vocabulary,
        world.constants,
        world.config.composed_cap,
        world.config.sourced_cap,
    ) else {
        state.pools.idle_sessions += 1;
        return;
    };

    let pool_tag = match passage.pool {
        Pool::Composed => "composed",
        Pool::Sourced => "sourced",
    };
    match passage.pool {
        Pool::Composed => state.pools.composed_sessions += 1,
        Pool::Sourced => state.pools.sourced_sessions += 1,
    }
    let frame_id = format!("sess-{session_index:05}-{pool_tag}");

    let mut clean_words = Vec::new();
    if passage.pool == Pool::Composed {
        let remaining_slots = world
            .config
            .composed_cap
            .saturating_sub(passage.due_words.len());
        while clean_words.len() < remaining_slots
            && state.next_new_word_index < world.vocabulary.reading.len()
        {
            clean_words.push(
                world.vocabulary.reading[state.next_new_word_index]
                    .id
                    .clone(),
            );
            state.next_new_word_index += 1;
        }
    }

    let mut gloss_words = Vec::new();
    for word in &passage.due_words {
        let difficulty = world.vocabulary.true_difficulty(word);
        if knows_real_item(rng, true_theta, difficulty) {
            clean_words.push(word.clone());
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
