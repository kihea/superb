//! The front door: `plan`, `decide`, and the effect stream a golden vector
//! can freeze.
//!
//! `docs/engine-contract.md` §2 draws the plan → fetch → decide pattern; §3
//! names the effect stream literally. Six briefs built pure functions that
//! never called each other — `state`, `tuning`, `learner`, `scheduler`,
//! `ability`, `signals` — and this module is the first place that changes:
//! it is the one caller that reads a [`signals::Event`], decides what it
//! means, and calls whichever of those six owns the answer. **Nothing else
//! in this crate mutates a [`LearnerState`]** (engine-contract §1 law 6):
//! [`decide`] is the only function that does, and it does so through the
//! same validating mutators every other module already exposed —
//! [`WordRecord::set_due_and_interval`], [`LearnerState::set_theta_and_se`],
//! [`WordState::apply`] — never around them.
//!
//! **What this module wires, read off `src/state.rs`'s own doc comments
//! rather than invented here.** A `DeckSwipe` or a `PassageFinished` on a
//! word this crate has no record of is first contact — [`Transition::Seeded`].
//! The strongest negative evidence a session carries — a `GlossTap`, or a
//! `ProbeResult` that did not assemble — is exactly the sentence `Transition
//! ::LearningBegun` and `Transition::Lapsed` already carry in their own doc
//! comments: "evidence arrived that the word is not yet known" (from
//! `Seeded`) and "a word that had settled came apart again" (from
//! `Consolidating` or `Automatic`). Both read as one rule: [`negative_transition`]
//! below. A word already in `Learning` needs no such push — evidence that it
//! is not yet automatic is not new information there.
//!
//! **`Transition::Consolidated` and `Transition::Automated`, wired in round
//! 3.** Round 2 settled *which count* triggers each edge — distinct-context
//! clean encounters, at `tuning.consolidating_threshold` and
//! `tuning.encounter_target` respectively, never a raw tally of every time the
//! word was scheduled — but had no field to read that count from:
//! `WordRecord::context_frames` was a bare `Vec<String>`, appended to by a `GlossTap`, a
//! `PassageFinished`, and a `PassageAbandoned` alike, on purpose, for a
//! different guarantee (engine-contract §4 — no word reuses a context it has
//! already been served in, regardless of how that encounter went). Counting
//! that list directly would count a gloss-tap's frame toward automaticity,
//! which round 2 explicitly forbids. Round 3's ARCHITECT'S ANSWER resolves
//! the contradiction at its source: `crate::learner::ContextEncounter`
//! carries a `frame_id` and whether the encounter was `clean`, so one list
//! answers both questions without the two ever being able to disagree.
//! [`log_context`] below now takes `clean` from its caller, and
//! [`advance_progression`] reads the distinct clean `frame_id`s to decide
//! whether `Learning -> Consolidating` or `Consolidating -> Automatic` fires.
//! Only [`Event::PassageFinished`] can produce a clean frame — a `GlossTap`'s
//! frame is always logged not-clean (the strongest negative signal this
//! crate has; letting it also advance a word toward automaticity would make
//! the schedule reward confusion), a `PassageAbandoned`'s frame is logged
//! not-clean for the same reason `PassageAbandoned` never reaches
//! [`schedule_and_record`] at all (it is not a
//! [`scheduler::EncounterOutcome::Clean`]), and a `ProbeResult`, assembled or
//! not, carries no frame id to log in the first place — so
//! [`advance_progression`] is only ever called from the
//! [`Event::PassageFinished`] arm.
//!
//! **Round 4: `WordRecord::encounters` removed.** BRIEF-013's review, finding
//! F1: the field was written on every [`schedule_and_record`] call and read
//! by nothing in this crate — "not derivable" only ever established that it
//! could not be computed, never that it was needed. Removed rather than kept
//! against a future reader; if one arrives, its definition comes from that
//! reader, not from this brief's guess.
//!
//! **What this module still deliberately does not decide.** Nothing here
//! ever constructs [`Effect::ProbeEligible`]: no function this crate has
//! built decides probe eligibility. Nothing here updates
//! `LearnerState::topic_affinities` from a `PassageAbandoned`:
//! engine-contract §3 promises one, but no event payload names which topic a
//! passage belongs to, or by how much — ratified as a known gap by this
//! brief's round 2, not debt.

use serde::{Deserialize, Serialize};

use crate::ability::{self, ThetaUpdate};
use crate::learner::{ContextEncounter, LearnerState, Timestamp, WordRecord};
use crate::scheduler::{self, EncounterOutcome};
use crate::signals::Event;
use crate::state::{Transition, WordState};
use crate::tuning::Tuning;

/// `now` and `tuning`, bundled — every helper below needs both, and neither
/// changes mid-`decide`, so passing this one `Copy` value keeps each
/// helper's own argument list short rather than repeating the pair
/// everywhere (`clippy::too_many_arguments`'s threshold is the mechanical
/// enforcement; the pair genuinely travels together for the whole call).
#[derive(Clone, Copy)]
struct Ctx<'a> {
    now: Timestamp,
    tuning: &'a Tuning,
}

/// What the host is asking the core to do (engine-contract §2). One variant
/// today: turn a single observed event into effects. A `NextPassage`-shaped
/// variant belongs to the composer, out of this brief's scope by design —
/// see the brief's own "Out of scope."
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum Request {
    /// Turn one host-observed event (engine-contract §3's event stream in)
    /// into effects.
    ProcessEvent(Event),
}

/// What the core needs fetched before it can decide `request`
/// (engine-contract §2, step 1). Declarative and small — everything else
/// the core needs already lives in `LearnerState` or in the `Request`
/// itself (engine-contract §1 law 4).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum Needs {
    /// Nothing beyond `LearnerState` and `Request` is required.
    Nothing,
    /// A `DeckSwipe` naming a real word (never a pseudoword — see
    /// [`ability::update_theta`]'s own doc comment) needs that item's
    /// difficulty, on the same logit scale θ itself lives on, before ability
    /// can be updated.
    ItemDifficulty {
        /// The deck item whose difficulty is needed.
        item_id: String,
    },
}

/// The host's answer to a [`Needs`] (engine-contract §2, step 2).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum Frame {
    /// Answers [`Needs::Nothing`].
    Nothing,
    /// Answers [`Needs::ItemDifficulty`].
    ItemDifficulty {
        /// The difficulty the host fetched.
        difficulty: f64,
    },
}

/// One effect, spelled and shaped exactly as engine-contract §3 names it:
/// `WordStateChanged`, `IntervalSet`, `ThetaUpdated`, `ProbeEligible`,
/// `ContextFrameLogged` — the names and payloads are a public contract, not
/// a naming preference.
///
/// Every variant but one is constructed in this brief; [`Effect::ProbeEligible`]
/// is declared for the contract's sake and is never constructed here — see
/// this module's own doc comment and the brief's `UNRESOLVED`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub enum Effect {
    /// From the state machine (`crate::state::WordState::apply`): a word
    /// moved from one [`WordState`] to another.
    WordStateChanged {
        /// The word that moved.
        word: String,
        /// Where it stood before.
        from: WordState,
        /// Where it stands now.
        to: WordState,
    },
    /// From the scheduler (`crate::scheduler::schedule_encounter`): a
    /// word's next due date.
    IntervalSet {
        /// The word this due date belongs to.
        word: String,
        /// When the word is next due.
        due: Timestamp,
    },
    /// From the ability estimator (`crate::ability::update_theta`): the
    /// learner's ability estimate after one observation.
    ThetaUpdated {
        /// The learner's ability estimate after this observation.
        theta: f64,
        /// θ's standard error after this observation.
        se: f64,
    },
    /// Never constructed in this brief — see this type's own doc comment.
    ProbeEligible {
        /// The word that would be eligible.
        word: String,
    },
    /// A word was served in a context — the passage or excerpt id it was
    /// met in — logged so a later brief's composer can honour "no word
    /// reuses one of its previous contexts" (engine-contract §4).
    ContextFrameLogged {
        /// The word that was served.
        word: String,
        /// The passage or excerpt id it was met in.
        frame_id: String,
    },
}

/// What one [`decide`] call produced: every effect, in the order it
/// happened. Order is part of the contract (this brief's own Done clause):
/// a golden vector compares byte-exactly, so two runs that emit the same
/// effects in a different order are a behaviour change, not a formatting
/// one.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Outcome {
    /// Every effect this `decide` call produced, in the order it happened.
    pub effects: Vec<Effect>,
}

/// Say what the core needs fetched before it can decide `request`
/// (engine-contract §2, step 1).
///
/// Pure (engine-contract §1): `request` is the whole input that matters
/// here; `learner` and `now` are accepted for symmetry with [`decide`] and
/// for a future request this brief does not add, and are not read by this
/// brief's one variant.
pub fn plan(_learner: &LearnerState, request: &Request, _now: Timestamp) -> Needs {
    match request {
        Request::ProcessEvent(Event::DeckSwipe {
            item_id,
            is_pseudoword: false,
            ..
        }) => Needs::ItemDifficulty {
            item_id: item_id.clone(),
        },
        Request::ProcessEvent(_) => Needs::Nothing,
    }
}

/// Turn `request` and the `frame` the host fetched for it into an ordered
/// list of effects (engine-contract §2, step 3).
///
/// The only function in this crate that mutates a [`LearnerState`]
/// (engine-contract §1 law 6), and it does so only through the mutators
/// each field's own module already validates with:
/// [`WordState::apply`], [`WordRecord::set_due_and_interval`], and
/// [`LearnerState::set_theta_and_se`].
pub fn decide(
    learner: &mut LearnerState,
    request: Request,
    frame: Frame,
    now: Timestamp,
    tuning: &Tuning,
) -> Outcome {
    let Request::ProcessEvent(event) = request;
    let mut effects = Vec::new();
    let ctx = Ctx { now, tuning };

    match event {
        Event::DeckSwipe {
            item_id,
            is_pseudoword,
            knew,
        } => decide_deck_swipe(
            learner,
            &item_id,
            is_pseudoword,
            knew,
            frame,
            ctx,
            &mut effects,
        ),

        Event::GlossTap {
            word,
            passage,
            position: _,
        } => {
            ensure_record(learner, &word, now);
            if let Some(transition) = negative_transition(current_state(learner, &word)) {
                apply_transition(learner, &word, transition, &mut effects);
            }
            schedule_and_record(
                learner,
                &word,
                EncounterOutcome::GlossTap,
                now,
                tuning,
                &mut effects,
            );
            // Logged, but never clean: engine-contract §4's variation
            // guarantee still needs this frame id on the list, but a gloss
            // tap is this crate's strongest negative signal, so it must not
            // also feed the progression thresholds `advance_progression`
            // reads (BRIEF-013 round 3).
            log_context(learner, &word, &passage, false, &mut effects);
        }

        Event::ProbeResult {
            word,
            assembled,
            attempts: _,
        } => {
            ensure_record(learner, &word, now);
            // An assembled probe is the strongest positive signal, but no
            // threshold this brief has been given decides whether it also
            // advances `WordState` — see this module's own doc comment. A
            // failed probe is the strongest negative signal, tied exactly
            // with `GlossTap` (`scheduler::EncounterOutcome`'s own doc
            // comment), so it is wired identically.
            if !assembled {
                if let Some(transition) = negative_transition(current_state(learner, &word)) {
                    apply_transition(learner, &word, transition, &mut effects);
                }
            }
            let outcome = if assembled {
                EncounterOutcome::Clean
            } else {
                EncounterOutcome::GlossTap
            };
            schedule_and_record(learner, &word, outcome, now, tuning, &mut effects);
        }

        Event::ScreenDwell { .. } => {
            // A weak, single-word-attributable negative signal
            // (`crate::signals::rank`) with no owning effect path this
            // brief's Done clause names — nothing is emitted.
        }

        Event::PassageFinished {
            passage,
            words_seen,
        } => {
            for word in &words_seen {
                ensure_record(learner, word, now);
                if current_state(learner, word) == WordState::Unseen {
                    apply_transition(learner, word, Transition::Seeded, &mut effects);
                }
                schedule_and_record(
                    learner,
                    word,
                    EncounterOutcome::Clean,
                    now,
                    tuning,
                    &mut effects,
                );
                // The only path that can log a *clean* frame — the only
                // outcome `advance_progression` reads (BRIEF-013 round 3).
                log_context(learner, word, &passage, true, &mut effects);
                advance_progression(learner, word, tuning, &mut effects);
            }
        }

        Event::PassageAbandoned {
            passage,
            words_seen,
        } => {
            // engine-contract §3: "a topic-affinity update and no
            // word-level signal." The words were still served, so the
            // context exposure is logged; the topic-affinity update is not
            // wired — see this module's own doc comment and this brief's
            // `UNRESOLVED`. Logged not-clean: an abandoned passage never
            // reaches `schedule_and_record` at all, so it was never treated
            // as a `scheduler::EncounterOutcome::Clean` encounter either —
            // this keeps `ContextEncounter::clean`'s meaning the same
            // question in both places.
            for word in &words_seen {
                ensure_record(learner, word, now);
                log_context(learner, word, &passage, false, &mut effects);
            }
        }
    }

    Outcome { effects }
}

/// The word's current [`WordState`] — `Unseen` for a word with no record
/// yet, the same convention [`scheduler::schedule_encounter`] and
/// [`scheduler::due_words`] use.
fn current_state(learner: &LearnerState, word: &str) -> WordState {
    learner
        .words
        .get(word)
        .map(|record| record.state)
        .unwrap_or(WordState::Unseen)
}

/// Ensure `word` has a [`WordRecord`] to write into before this call
/// schedules or logs against it. A word already met has one; a word this
/// call is about to touch for the first time gets a bare one — `Unseen`,
/// due now, never yet intervaled — mirroring `schedule_encounter`'s own
/// "treated as `Unseen`" convention for an absent word, so the two never
/// disagree about what "no history" means.
fn ensure_record(learner: &mut LearnerState, word: &str, now: Timestamp) {
    learner
        .words
        .entry(word.to_string())
        .or_insert_with(|| WordRecord::new(WordState::Unseen, now, Vec::new(), None));
}

/// The one state transition the strongest negative evidence a session
/// carries — a `GlossTap`, or a `ProbeResult` that did not assemble —
/// implies from `state`, read directly off `src/state.rs`'s own doc
/// comments rather than invented here: [`Transition::LearningBegun`] is
/// "evidence arrived that the word is not yet known" (only reachable from
/// `Seeded`); [`Transition::Lapsed`] is "a word that had settled came apart
/// again" (only reachable from `Consolidating` or `Automatic`). A word
/// already `Learning` needs no such push — the evidence is not new there —
/// and a word with no record yet (`Unseen`) is out of this call's reach by
/// construction: [`WordState::apply`] has no edge from `Unseen` for either
/// transition, so this function returns `None` before ever asking.
fn negative_transition(state: WordState) -> Option<Transition> {
    match state {
        WordState::Seeded => Some(Transition::LearningBegun),
        WordState::Consolidating | WordState::Automatic => Some(Transition::Lapsed),
        WordState::Unseen | WordState::Learning => None,
    }
}

/// Apply `transition` to `word`'s current state and push the resulting
/// [`Effect::WordStateChanged`] — the only place this module writes
/// [`WordRecord::state`], and only ever with the receipt
/// [`WordState::apply`] handed back.
fn apply_transition(
    learner: &mut LearnerState,
    word: &str,
    transition: Transition,
    effects: &mut Vec<Effect>,
) {
    let state = current_state(learner, word);
    if let Ok(changed) = state.apply(transition) {
        if let Some(record) = learner.words.get_mut(word) {
            record.state = changed.to();
        }
        effects.push(Effect::WordStateChanged {
            word: word.to_string(),
            from: changed.from(),
            to: changed.to(),
        });
    }
}

/// Run [`scheduler::schedule_encounter`], write both halves of its
/// [`scheduler::ScheduleDecision`] back into `word`'s record through
/// [`WordRecord::set_due_and_interval`] — never around it — and push the
/// resulting [`Effect::IntervalSet`].
fn schedule_and_record(
    learner: &mut LearnerState,
    word: &str,
    outcome: EncounterOutcome,
    now: Timestamp,
    tuning: &Tuning,
    effects: &mut Vec<Effect>,
) {
    let decision = scheduler::schedule_encounter(learner, word, outcome, now, tuning);
    if let Some(record) = learner.words.get_mut(word) {
        record.set_due_and_interval(decision.due, decision.interval_days);
    }
    effects.push(Effect::IntervalSet {
        word: decision.effect.word,
        due: decision.effect.due,
    });
}

/// Log `frame_id` against `word`'s [`WordRecord::context_frames`], carrying
/// whether this encounter was `clean` (BRIEF-013 round 3 — see
/// [`crate::learner::ContextEncounter`]), and push the resulting
/// [`Effect::ContextFrameLogged`]. `Effect::ContextFrameLogged` itself is
/// unchanged by round 3 — engine-contract §3 fixes its shape at `{ word,
/// frame_id }`, and `clean` is answered by reading the stored list back, not
/// by widening the effect. Whether `frame_id` repeats one of `word`'s
/// previous contexts is the composer's guard to keep, not this brief's
/// (engine-contract §4; the composer is out of this brief's scope) — this
/// call only ever appends and reports.
fn log_context(
    learner: &mut LearnerState,
    word: &str,
    frame_id: &str,
    clean: bool,
    effects: &mut Vec<Effect>,
) {
    if let Some(record) = learner.words.get_mut(word) {
        record.context_frames.push(ContextEncounter {
            frame_id: frame_id.to_string(),
            clean,
        });
    }
    effects.push(Effect::ContextFrameLogged {
        word: word.to_string(),
        frame_id: frame_id.to_string(),
    });
}

/// How many distinct context frame ids `word`'s record has been *cleanly*
/// met in — the count `consolidating_threshold` and `encounter_target` are
/// measured against (BRIEF-013 round 3). Distinct rather than a raw tally: a
/// word logged clean twice in the same frame (never supposed to happen once
/// the composer honours engine-contract §4, but nothing in this crate's own
/// types forbids it yet) must not count double toward a threshold that
/// exists to reward *varied* context, not repetition.
fn distinct_clean_frame_count(learner: &LearnerState, word: &str) -> usize {
    let Some(record) = learner.words.get(word) else {
        return 0;
    };
    let mut distinct_clean_ids = std::collections::BTreeSet::new();
    for encounter in &record.context_frames {
        if encounter.clean {
            distinct_clean_ids.insert(encounter.frame_id.as_str());
        }
    }
    distinct_clean_ids.len()
}

/// Apply `Learning -> Consolidating` and `Consolidating -> Automatic` as far
/// as `word`'s current distinct-clean-frame count now supports (BRIEF-013
/// round 3, ARCHITECT'S ANSWER). Called only after [`log_context`] logs a
/// *clean* frame — [`Event::PassageFinished`] is the only arm that does —
/// since neither edge can become newly true any other way: a `GlossTap`'s
/// frame is never clean, a `PassageAbandoned`'s frame is never clean, and a
/// `ProbeResult` logs no frame at all.
///
/// Loops rather than checking once: `Tuning::validate` guarantees
/// `consolidating_threshold < encounter_target`, so a single ordinary
/// encounter cannot cross both in one call, but a `LearnerState` built or
/// edited by hand (a test, a simulator seed) could already sit at or past
/// `encounter_target` the moment it enters `Learning` — this still advances
/// it as far as the count actually supports, in order, rather than stalling
/// on the first edge.
fn advance_progression(
    learner: &mut LearnerState,
    word: &str,
    tuning: &Tuning,
    effects: &mut Vec<Effect>,
) {
    loop {
        let count = distinct_clean_frame_count(learner, word) as u32;
        let transition = match current_state(learner, word) {
            WordState::Learning if count >= tuning.consolidating_threshold => {
                Transition::Consolidated
            }
            WordState::Consolidating if count >= tuning.encounter_target => Transition::Automated,
            _ => return,
        };
        apply_transition(learner, word, transition, effects);
    }
}

/// A `DeckSwipe`: first contact for a real word not yet in `learner.words`
/// ([`Transition::Seeded`] — "the deck ... put the word in front of the
/// learner," `src/state.rs`'s own doc comment), then [`ability::update_theta`]
/// unconditionally — every `DeckSwipe`, pseudoword or not, is engine-contract
/// §3's "calibration seed."
///
/// A freshly seeded word **is** scheduled here, at `interval_initial_days`
/// (this brief's ARCHITECT'S ANSWER, round 2, overturning the implementer's
/// original choice not to). The θ band selects new words to seed; the due
/// list returns seen words; a `Seeded` word that left neither pool would
/// depend on the composer happening to pick it up again, and chance is not a
/// schedule. [`scheduler::schedule_encounter`] with
/// [`EncounterOutcome::Clean`] produces exactly `interval_initial_days` here:
/// `widen_multiplier` is `1.0` for `Seeded`, and the word has no prior
/// `interval_days` to multiply, so the base is `tuning.interval_initial_days`
/// itself.
fn decide_deck_swipe(
    learner: &mut LearnerState,
    item_id: &str,
    is_pseudoword: bool,
    knew: bool,
    frame: Frame,
    ctx: Ctx<'_>,
    effects: &mut Vec<Effect>,
) {
    if !is_pseudoword && !learner.words.contains_key(item_id) {
        learner.words.insert(
            item_id.to_string(),
            WordRecord::new(WordState::Unseen, ctx.now, Vec::new(), None),
        );
        apply_transition(learner, item_id, Transition::Seeded, effects);
        schedule_and_record(
            learner,
            item_id,
            EncounterOutcome::Clean,
            ctx.now,
            ctx.tuning,
            effects,
        );
    }

    let difficulty = match frame {
        Frame::ItemDifficulty { difficulty } => difficulty,
        // A pseudoword ignores difficulty entirely
        // (`ability::update_theta`'s own doc comment); a real word whose
        // frame did not answer `Needs::ItemDifficulty` — a host that did
        // not honour `plan`'s request — falls back to the logit scale's
        // neutral point rather than panicking.
        Frame::Nothing => 0.0,
    };

    let update: ThetaUpdate = ability::update_theta(
        learner.theta(),
        learner.theta_se(),
        difficulty,
        knew,
        is_pseudoword,
        ctx.tuning,
    );
    learner
        .set_theta_and_se(update.theta, update.theta_se, ctx.tuning)
        .expect("update_theta always produces a theta and theta_se set_theta_and_se accepts");

    effects.push(Effect::ThetaUpdated {
        theta: update.effect.theta,
        se: update.effect.se,
    });
}

#[cfg(test)]
mod progression_tests {
    //! BRIEF-013 round 3: `Transition::Consolidated` and
    //! `Transition::Automated`, and the rule that only a *clean* context
    //! frame can produce either. These exercise [`decide`] end to end rather
    //! than [`advance_progression`] directly — the same style the golden
    //! vectors use — because the guarantee that matters is what the whole
    //! `decide` call does with a real event, not what one internal helper
    //! computes in isolation.

    use std::collections::BTreeMap;

    use super::*;
    use crate::learner::ContextEncounter;

    /// A learner with exactly one word, `"w"`, in `state`, already carrying
    /// `context_frames` — built directly rather than through `decide`, so
    /// each test starts from a precise, hand-chosen count instead of
    /// reconstructing one through a chain of prior events.
    fn learner_with_word(state: WordState, context_frames: Vec<ContextEncounter>) -> LearnerState {
        let mut words = BTreeMap::new();
        words.insert(
            "w".to_string(),
            WordRecord::new(
                state,
                Timestamp::from_millis_since_epoch(0),
                context_frames,
                None,
            ),
        );
        LearnerState::new(0, 0, 0.0, 1.0, words, BTreeMap::new())
    }

    fn clean(frame_id: &str) -> ContextEncounter {
        ContextEncounter {
            frame_id: frame_id.to_string(),
            clean: true,
        }
    }

    fn not_clean(frame_id: &str) -> ContextEncounter {
        ContextEncounter {
            frame_id: frame_id.to_string(),
            clean: false,
        }
    }

    fn finish_passage(learner: &mut LearnerState, passage: &str, tuning: &Tuning) -> Outcome {
        decide(
            learner,
            Request::ProcessEvent(Event::PassageFinished {
                passage: passage.to_string(),
                words_seen: vec!["w".to_string()],
            }),
            Frame::Nothing,
            Timestamp::from_millis_since_epoch(0),
            tuning,
        )
    }

    /// Shipped `consolidating_threshold` is 4: three prior distinct clean
    /// frames plus one more from this call reaches it, and the word moves.
    #[test]
    fn the_consolidating_threshold_th_distinct_clean_frame_advances_learning_to_consolidating() {
        let tuning = Tuning::default();
        let mut learner = learner_with_word(
            WordState::Learning,
            vec![clean("p1"), clean("p2"), clean("p3")],
        );

        let outcome = finish_passage(&mut learner, "p4", &tuning);

        assert!(
            outcome.effects.contains(&Effect::WordStateChanged {
                word: "w".to_string(),
                from: WordState::Learning,
                to: WordState::Consolidating,
            }),
            "expected Learning -> Consolidating, got {:?}",
            outcome.effects
        );
        assert_eq!(learner.words["w"].state, WordState::Consolidating);
    }

    /// One distinct clean frame short of `consolidating_threshold` holds —
    /// the edge does not fire early.
    #[test]
    fn one_short_of_the_consolidating_threshold_holds_in_learning() {
        let tuning = Tuning::default();
        let mut learner = learner_with_word(WordState::Learning, vec![clean("p1"), clean("p2")]);

        let outcome = finish_passage(&mut learner, "p3", &tuning);

        assert!(
            !outcome
                .effects
                .iter()
                .any(|effect| matches!(effect, Effect::WordStateChanged { .. })),
            "expected no state change, got {:?}",
            outcome.effects
        );
        assert_eq!(learner.words["w"].state, WordState::Learning);
    }

    /// Shipped `encounter_target` is 10: the same edge, one state later.
    #[test]
    fn the_encounter_target_th_distinct_clean_frame_advances_consolidating_to_automatic() {
        let tuning = Tuning::default();
        let nine_clean_frames = (1..=9).map(|n| clean(&format!("p{n}"))).collect();
        let mut learner = learner_with_word(WordState::Consolidating, nine_clean_frames);

        let outcome = finish_passage(&mut learner, "p10", &tuning);

        assert!(
            outcome.effects.contains(&Effect::WordStateChanged {
                word: "w".to_string(),
                from: WordState::Consolidating,
                to: WordState::Automatic,
            }),
            "expected Consolidating -> Automatic, got {:?}",
            outcome.effects
        );
        assert_eq!(learner.words["w"].state, WordState::Automatic);
    }

    /// A count already past both thresholds by the time it re-enters
    /// `Learning` — the shape a lapse-then-catch-up, or a hand-built
    /// `LearnerState`, could produce — advances through both edges in one
    /// `decide` call rather than stalling on the first.
    #[test]
    fn a_count_already_past_both_thresholds_advances_through_both_in_one_call() {
        let tuning = Tuning::default();
        let nine_clean_frames = (1..=9).map(|n| clean(&format!("p{n}"))).collect();
        let mut learner = learner_with_word(WordState::Learning, nine_clean_frames);

        let outcome = finish_passage(&mut learner, "p10", &tuning);

        assert_eq!(
            outcome
                .effects
                .iter()
                .filter(|effect| matches!(effect, Effect::WordStateChanged { .. }))
                .collect::<Vec<_>>(),
            vec![
                &Effect::WordStateChanged {
                    word: "w".to_string(),
                    from: WordState::Learning,
                    to: WordState::Consolidating,
                },
                &Effect::WordStateChanged {
                    word: "w".to_string(),
                    from: WordState::Consolidating,
                    to: WordState::Automatic,
                },
            ],
            "expected both edges, in order, got {:?}",
            outcome.effects
        );
        assert_eq!(learner.words["w"].state, WordState::Automatic);
    }

    /// A gloss tap on a new passage logs the frame — the variation guarantee
    /// still needs it — but does not move the count, because it is logged
    /// not-clean. Three clean frames plus a gloss-tapped fourth is still one
    /// short of the shipped `consolidating_threshold` of 4.
    #[test]
    fn a_gloss_tapped_frame_is_logged_but_never_advances_progression() {
        let tuning = Tuning::default();
        let mut learner = learner_with_word(
            WordState::Learning,
            vec![clean("p1"), clean("p2"), clean("p3")],
        );

        let outcome = decide(
            &mut learner,
            Request::ProcessEvent(Event::GlossTap {
                word: "w".to_string(),
                passage: "p4".to_string(),
                position: 0,
            }),
            Frame::Nothing,
            Timestamp::from_millis_since_epoch(0),
            &tuning,
        );

        assert!(
            outcome.effects.contains(&Effect::ContextFrameLogged {
                word: "w".to_string(),
                frame_id: "p4".to_string(),
            }),
            "the frame must still be logged: {:?}",
            outcome.effects
        );
        assert!(
            !outcome
                .effects
                .iter()
                .any(|effect| matches!(effect, Effect::WordStateChanged { .. })),
            "a gloss tap on a Learning word must not change its state: {:?}",
            outcome.effects
        );
        assert_eq!(learner.words["w"].state, WordState::Learning);
        assert!(
            learner.words["w"].context_frames.contains(&not_clean("p4")),
            "the logged frame must be marked not clean: {:?}",
            learner.words["w"].context_frames
        );
    }

    /// The same passage logged clean twice — not supposed to happen once the
    /// composer honours engine-contract §4, but nothing in this crate's own
    /// types forbids it yet — must not count twice toward a threshold that
    /// exists to reward *varied* context.
    #[test]
    fn a_repeated_clean_frame_id_does_not_double_count() {
        let tuning = Tuning::default();
        let mut learner = learner_with_word(
            WordState::Learning,
            vec![clean("p1"), clean("p2"), clean("p3")],
        );

        // "p1" again: three distinct ids either way, one short of the
        // shipped threshold of 4.
        let outcome = finish_passage(&mut learner, "p1", &tuning);

        assert!(
            !outcome
                .effects
                .iter()
                .any(|effect| matches!(effect, Effect::WordStateChanged { .. })),
            "a repeated frame id must not push the distinct count over the threshold: {:?}",
            outcome.effects
        );
        assert_eq!(learner.words["w"].state, WordState::Learning);
    }
}
