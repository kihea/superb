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

<<<<<<< HEAD
use crate::corpus::RealCorpus;
use crate::library::{Library, band_words, word_classes};
use crate::oracle::{claims_pseudoword, finishes_passage, knows_real_item, knows_real_item_after};
use crate::rng::Rng;
use crate::vocabulary::{Vocabulary, generate, generate_real};
=======
use crate::library::{Library, band_words, word_classes};
use crate::oracle::{claims_pseudoword, finishes_passage, knows_real_item, knows_real_item_after};
use crate::rng::Rng;
use crate::vocabulary::{Vocabulary, generate};
>>>>>>> main
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
<<<<<<< HEAD
    /// How many composed templates the library holds. Defaults to
    /// [`crate::library::COMPOSED_PASSAGES`]; only `src/calibration.rs`
    /// overrides it, and only to hold the composed side fixed while it
    /// varies `sourced_library_size`.
    pub composed_library_size: usize,
    /// How many sourced excerpts the library holds. Defaults to
    /// [`crate::library::SOURCED_EXCERPTS`]; `src/calibration.rs` sweeps this
    /// to answer what corpus size the sourced-share target actually needs —
    /// a question about the library, not about `sourced_preference`.
    pub sourced_library_size: usize,
=======
>>>>>>> main
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
            //
            // 240 rather than 180 since ADR-022: a reader now abandons some
            // passages, and an abandoned passage schedules nothing and logs no
            // clean frame, so a quarter of reading sessions no longer carry a
            // word forward. Modelling taste costs throughput, and the horizon
            // is where that cost is paid rather than hidden.
            sessions: 240,
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
<<<<<<< HEAD
            composed_library_size: crate::library::COMPOSED_PASSAGES,
            sourced_library_size: crate::library::SOURCED_EXCERPTS,
=======
>>>>>>> main
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
    /// Sessions whose passage the reader stayed with, and sessions they left
    /// (ADR-022). The denominator the recommender's assertion is read against.
    pub finished_sessions: usize,
    pub abandoned_sessions: usize,
}

<<<<<<< HEAD
/// Issue #35's four-class encounter report (M2 DONE item 3, ADVISORY-007 §1
/// and its addendum A3(c)): every real-word encounter this run produced,
/// classified by where the reader met the word. Counted at the *word* level
/// — one passage can carry several encounters — because the gate item 3
/// names ("the majority of word encounters... occur inside passages rather
/// than in the deck") is about how many words were met where, not how many
/// sessions chose which pool ([`PoolTally`], already above, keeps that
/// session-level count for the assertions that were already reading it).
#[derive(Debug, Clone, Copy, Default)]
pub struct EncounterTally {
    /// A real-word `DeckSwipe`. Pseudoword draws are excluded on purpose —
    /// a pseudoword is not a vocabulary word and teaches nothing, so
    /// counting it here would inflate the deck's own share of a gate about
    /// what the reader is actually learning.
    pub deck: usize,
    /// A word shown inside a composed passage. Every composed encounter
    /// this simulator can currently produce lands here — see
    /// `composed_for_support`'s own doc comment for why.
    pub composed_for_gap: usize,
    /// **Unreachable by construction, and expected to read zero.**
    /// ADVISORY-007 addendum A2.3/A3(c): "support" is a second precedence
    /// arm — composing a gentler passage for a reader who is struggling even
    /// though an adequate sourced excerpt exists — that requires the
    /// sourced/composed *precedence* ADR-015's third amendment describes.
    /// That precedence is not implemented on `dev` as of issue #35 (the
    /// composer still scores both pools with a `sourced_preference`
    /// multiplier, `crates/superb-core/src/composer.rs`'s own doc comment);
    /// there is no "adequate sourced candidate existed but composed served
    /// this reader anyway" branch for a composed encounter to be logged
    /// against. This field exists so the schema does not change the day
    /// that precedence lands and a pedagogy decision defines what "support"
    /// selects for (`docs/open-questions.md`) — until then, every composed
    /// encounter is `composed_for_gap` and this reads zero. **A reader
    /// seeing this column at zero is reading the mechanism correctly, not
    /// finding a bug.**
    pub composed_for_support: usize,
    /// A word shown inside a sourced excerpt.
    pub sourced: usize,
}

impl EncounterTally {
    pub fn passages(&self) -> usize {
        self.composed_for_gap + self.composed_for_support + self.sourced
    }

    pub fn total(&self) -> usize {
        self.deck + self.passages()
    }

    /// M2 DONE item 3's gate: strictly more encounters inside passages than
    /// in the deck. `false` on a tie or on zero encounters — a gate that
    /// reads green on no evidence is not a gate.
    pub fn passages_are_the_majority(&self) -> bool {
        self.passages() > self.deck
    }
}

/// Directive 3's band coverage, aggregated over one run's own due lists —
/// see `crate::corpus::coverage_of`'s own doc comment for what "coverage"
/// means here (existence in the corpus, not selection by the composer).
#[derive(Debug, Clone, Copy, Default)]
pub struct DueListCoverageTally {
    /// Sessions with a nonempty due list — the denominator.
    pub sessions: usize,
    pub at_least_1: usize,
    pub at_least_2: usize,
}

impl DueListCoverageTally {
    pub fn at_least_1_rate(&self) -> f64 {
        if self.sessions == 0 {
            0.0
        } else {
            self.at_least_1 as f64 / self.sessions as f64
        }
    }

    pub fn at_least_2_rate(&self) -> f64 {
        if self.sessions == 0 {
            0.0
        } else {
            self.at_least_2 as f64 / self.sessions as f64
        }
    }
}

=======
>>>>>>> main
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
<<<<<<< HEAD
    /// Issue #35's four-class word-encounter report — see
    /// [`EncounterTally`]'s own doc comment.
    pub encounters: EncounterTally,
    /// Directive 3's band coverage, this run's own due lists against the
    /// sourced pool it was offered — see [`DueListCoverageTally`].
    pub due_list_coverage: DueListCoverageTally,
=======
>>>>>>> main
    /// The engine's learned finish-rate per topic at the end of the run, beside
    /// this reader's hidden true taste for it (ADR-022). One row per topic the
    /// reader ever met — the recommender's assertion is read off this.
    pub topic_estimates: Vec<(String, f64, f64)>,
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
<<<<<<< HEAD
    /// Issue #35's word-encounter tally — see [`EncounterTally`].
    encounters: EncounterTally,
    /// Sessions whose due list was nonempty — the denominator for
    /// `due_list_coverage_at_least_1`/`_2` below (directive 3's band
    /// coverage).
    due_list_sessions: usize,
    due_list_coverage_at_least_1: usize,
    due_list_coverage_at_least_2: usize,
=======
>>>>>>> main
}

/// Run one synthetic learner's whole simulation and return everything
/// `report.rs` needs. Deterministic in `seed` and `true_theta` — nothing
<<<<<<< HEAD
/// else varies the output. Runs against the shipped [`Tuning`]; see
/// [`run_with_tuning`] for the one caller (`src/calibration.rs`) that needs
/// a different one.
pub fn run(seed: u64, true_theta: f64, config: &SimConfig) -> SimulationOutcome {
    run_with_tuning(seed, true_theta, config, &Tuning::default())
}

/// [`run`], against a caller-supplied [`Tuning`] rather than the shipped
/// one.
///
/// **Why this exists as a separate function instead of a `Tuning` field on
/// `SimConfig`.** Every other run in this crate — the committed report, the
/// five assertions, `tests/assertions.rs` — must run against the *shipped*
/// tuning, because that is what "the engine" means for a golden-vector-style
/// artifact: a report whose own tuning silently drifted from
/// `tuning.toml` would stop being a report about the product. Only
/// `src/calibration.rs` genuinely needs a different one — it exists to
/// search over `sourced_preference`, which is exactly the one thing a
/// calibration instrument may vary without that being "tuning the constant
/// against the synthetic corpus" (ADVISORY-005 §2's own prohibition; the
/// search here never writes its answer back into `tuning.toml`). Keeping
/// that need on a second function rather than a field on `SimConfig` makes
/// it impossible for a future caller of `run` to pass a nonstandard tuning
/// by accident.
pub fn run_with_tuning(
    seed: u64,
    true_theta: f64,
    config: &SimConfig,
    tuning: &Tuning,
) -> SimulationOutcome {
=======
/// else varies the output.
pub fn run(seed: u64, true_theta: f64, config: &SimConfig) -> SimulationOutcome {
>>>>>>> main
    let mut rng = Rng::new(seed);
    let vocabulary = generate(
        &mut rng,
        config.reading_vocabulary_size,
        config.calibration_pool_size,
        config.pseudoword_pool_size,
        config.sourced_eligible_rate,
    );
<<<<<<< HEAD
=======
    let tuning = Tuning::default();
>>>>>>> main
    // Built from the same `rng` the rest of the run draws from, before any
    // session runs: the library is part of the world, so it must be fixed by
    // the seed like everything else.
    let library = Library::build(
        &mut rng,
        &vocabulary,
        config.composed_cap,
        config.sourced_cap,
<<<<<<< HEAD
        config.composed_library_size,
        config.sourced_library_size,
    );
    let world = World {
        vocabulary: &vocabulary,
        tuning,
=======
    );
    let world = World {
        vocabulary: &vocabulary,
        tuning: &tuning,
>>>>>>> main
        config,
        library: &library,
        word_classes: word_classes(&vocabulary),
    };
<<<<<<< HEAD
    run_world(seed, true_theta, config, &mut rng, world)
}

/// [`run_with_tuning`], against the real content corpus (issue #35) instead
/// of the synthetic library — everything downstream of `World` is identical,
/// which is the point: the session loop, the oracle boundary, and every
/// determinism guarantee are exactly the same code the golden-path runs
/// through, only the candidates and the vocabulary they are drawn from
/// differ.
///
/// **Behind an explicit call, not a `SimConfig` flag.** `REPORT.md`,
/// `tests/assertions.rs`, and every other existing caller keep calling
/// [`run`]/[`run_with_tuning`] exactly as before — this function is additive,
/// so the synthetic golden path's bytes cannot move by a line this function
/// adds. `RealCorpus::load` does the one piece of I/O this crate's purity
/// note already discloses (`src/lib.rs`'s own doc comment: "not pure...
/// but deterministic"); loading is itself deterministic (same files in, same
/// `Candidate`s out — `corpus.rs`'s own test), so the run stays reproducible
/// from `(seed, true_theta, content_root)`.
pub fn run_real(
    seed: u64,
    true_theta: f64,
    config: &SimConfig,
    tuning: &Tuning,
    corpus: &RealCorpus,
) -> SimulationOutcome {
    let mut rng = Rng::new(seed);
    let vocabulary = generate_real(
        &mut rng,
        &corpus.reading_words,
        &corpus.sourced_words,
        &corpus.topics,
        config.pseudoword_pool_size,
    );
    // No rng draw here, unlike the synthetic `Library::build`: the real
    // library is fixed content, not generated, so cloning it consumes no
    // randomness and every seed sees the identical candidate set — only the
    // learner's own draws (calibration outcomes, oracle responses) vary.
    let library = Library {
        composed: corpus.composed.clone(),
        sourced: corpus.sourced.clone(),
    };
    let world = World {
        vocabulary: &vocabulary,
        tuning,
        config,
        library: &library,
        word_classes: corpus.word_classes.clone(),
    };
    run_world(seed, true_theta, config, &mut rng, world)
}

/// The session loop shared by [`run_with_tuning`] and [`run_real`] — every
/// line here ran, unmodified, inside `run_with_tuning` before issue #35
/// split it out, so the synthetic golden path's byte-for-byte output is
/// unchanged (`tests::a_run_is_deterministic_from_its_seed` below, and
/// `REPORT.md`'s own committed bytes, both still pass unmodified). `rng` is
/// already partway through its sequence (vocabulary and, for the synthetic
/// path, library construction already drew from it) and continues from
/// there — a fresh `Rng::new(seed)` here would replay draws the caller
/// already made and desynchronize the two paths' streams.
fn run_world(
    seed: u64,
    true_theta: f64,
    config: &SimConfig,
    rng: &mut Rng,
    world: World,
) -> SimulationOutcome {
=======

>>>>>>> main
    let mut learner = LearnerState::new(
        seed,
        0,
        0.0,
<<<<<<< HEAD
        world.tuning.theta_prior_information(),
=======
        tuning.theta_prior_information(),
>>>>>>> main
        BTreeMap::new(),
        BTreeMap::new(),
    );
    let mut due_list_sizes = Vec::with_capacity(config.sessions);
    let mut state = RunState::default();
    let session_millis = (config.session_length_days * MILLIS_PER_DAY as f64) as u64;

    for session_index in 0..config.sessions {
        let now = Timestamp::from_millis_since_epoch(session_millis * session_index as u64);

        due_list_sizes.push(due_words(&learner, now).len());

<<<<<<< HEAD
        run_calibration(&mut learner, rng, &world, &mut state, now, true_theta);
        run_reading_session(
            &mut learner,
            rng,
=======
        run_calibration(&mut learner, &mut rng, &world, now, true_theta);
        run_reading_session(
            &mut learner,
            &mut rng,
>>>>>>> main
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
<<<<<<< HEAD
        final_theta: learner.theta(world.tuning),
=======
        final_theta: learner.theta(),
>>>>>>> main
        final_theta_se: learner.theta_se(),
        due_list_sizes,
        encounters_to_automatic: state.encounters_to_automatic,
        pools: state.pools,
<<<<<<< HEAD
        encounters: state.encounters,
        due_list_coverage: DueListCoverageTally {
            sessions: state.due_list_sessions,
            at_least_1: state.due_list_coverage_at_least_1,
            at_least_2: state.due_list_coverage_at_least_2,
        },
=======
>>>>>>> main
        topic_estimates: learner
            .topic_affinities
            .iter()
            .filter_map(|(topic, record)| {
                let rate = record.rate()?;
<<<<<<< HEAD
                let truth = *world.vocabulary.topic_taste.get(topic)?;
=======
                let truth = *vocabulary.topic_taste.get(topic)?;
>>>>>>> main
                Some((topic.clone(), rate, truth))
            })
            .collect(),
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
<<<<<<< HEAD
    state: &mut RunState,
=======
>>>>>>> main
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

<<<<<<< HEAD
        // A deck encounter of a real word — issue #35's encounter tally.
        // Pseudoword draws are a calibration-honesty check, not a vocabulary
        // encounter, so they are excluded (`EncounterTally::deck`'s own doc
        // comment).
        if !is_pseudoword {
            state.encounters.deck += 1;
        }

=======
>>>>>>> main
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
        Needs::PassageCandidates { .. } | Needs::PassageTopics { .. } => {
            unreachable!("a DeckSwipe never asks for candidates or topics")
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

<<<<<<< HEAD
    // Directive 3's band coverage, read straight off this session's real due
    // list rather than a separately sampled one — see
    // `crate::corpus::coverage_of`'s own doc comment. Computed on *every*
    // session with a nonempty due list, independent of what the composer
    // goes on to choose below: this answers what the corpus offers, not
    // what got picked.
    state.due_list_sessions += 1;
    let coverage = crate::corpus::coverage_of(&world.library.sourced, due_words);
    if coverage.at_least_1 {
        state.due_list_coverage_at_least_1 += 1;
    }
    if coverage.at_least_2 {
        state.due_list_coverage_at_least_2 += 1;
    }

=======
>>>>>>> main
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

<<<<<<< HEAD
    // Issue #35's word-encounter tally: every word this passage put on the
    // page, whichever pool it came from. `composed_for_support` is never
    // written here — see its own doc comment on [`EncounterTally`] for why
    // the current mechanism cannot produce it.
    match passage.pool {
        Pool::Composed => state.encounters.composed_for_gap += words_on_screen.len(),
        Pool::Sourced => state.encounters.sourced += words_on_screen.len(),
    }

=======
>>>>>>> main
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

    // Whether this reader stays with the passage at all (ADR-022). Drawn from
    // their hidden taste for its topic — the engine never sees that number, only
    // which of the two events arrives, which is the whole point of the
    // assertion the recommender is judged by.
    let taste = passage
        .topics
        .iter()
        .filter_map(|topic| world.vocabulary.topic_taste.get(topic))
        .copied()
        .fold((0.0, 0usize), |(sum, n), t| (sum + t, n + 1));
    let mean_taste = if taste.1 == 0 {
        0.5
    } else {
        taste.0 / taste.1 as f64
    };
    let finished = finishes_passage(rng, mean_taste);

    let request = if finished {
        state.pools.finished_sessions += 1;
        Request::ProcessEvent(Event::PassageFinished {
            passage: frame_id,
            words_seen: clean_words,
        })
    } else {
        state.pools.abandoned_sessions += 1;
        Request::ProcessEvent(Event::PassageAbandoned {
            passage: frame_id,
            words_seen: clean_words,
        })
    };
    // The host answers `Needs::PassageTopics` from the same content index the
    // candidates came from (ADR-022 D2) — a lookup, not a claim.
    let topics_frame = Frame::Topics {
        topics: passage.topics.clone(),
    };
    let outcome = decide(learner, request, topics_frame, now, world.tuning);

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
