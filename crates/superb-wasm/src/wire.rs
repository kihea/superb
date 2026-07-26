//! The wire shape: exactly `docs/seams.md` §Seam 1, and the conversions to
//! and from `superb-core`'s own types.
//!
//! **Why this module exists instead of just deriving `Serialize` on
//! `superb-core`'s types and shipping that.** `superb-core`'s own JSON shape
//! is not this shape. `Event` and `Request` serialize externally tagged
//! (`{"DECK_SWIPE": {...}}`), `Event`'s variant names are
//! `SCREAMING_SNAKE_CASE`, and every field keeps its Rust name
//! (`item_id`, `is_pseudoword`, `words_seen`). That shape is correct for what
//! it is for — golden vectors, and a wire format shared with the JNI and
//! Swift FFI bindings — but it is not `docs/seams.md`'s frozen
//! `{ kind: "DeckSwipe"; itemId; isPseudoword; knew }`. Reusing
//! `superb-core`'s derives here would mean the seam is only true by
//! accident, and would break the moment either side's serde derive changed
//! for its own reasons. This module makes the translation the one thing that
//! has to hold, instead.
//!
//! **Two directions, two derive sets.** A wire type only ever crosses one way
//! — host to core (`Request`, `Event`, `Frame`, its nested content types) or
//! core to host (`Needs`, `Effect`, `Passage`) — so each only derives the
//! serde half it actually uses. Deriving both on everything would let a type
//! meant to go one way compile for a call that sends it the other, silently.
//!
//! **`Needs::PassageTopics`, `Frame::Topics`, `Effect::TopicAffinityUpdated`
//! (ADR-022's topic-affinity update) are part of the seam.** `docs/seams.md`
//! froze before ADR-022 landed and was missing all three; amended
//! 2026-07-25 ("the seam catches up with ADR-022") to add them, ratified —
//! not reopened — because ADR-022 itself was already accepted (ADVISORY-006
//! §1). `Effect::TopicAffinityUpdated` crosses this boundary and is never
//! rendered (the seam's own words); this module's job stops at binding it
//! faithfully — see `WireEffect::TopicAffinityUpdated`'s own doc comment.
//!
//! **`Candidate.topics` and `Passage.topics` are not (yet) in the seam, and
//! this module carries them anyway.** `superb-core::composer`'s
//! `taste_multiplier` reads `candidate.topics` to score ADR-022's own taste
//! signal (`src/composer.rs` line ~640) — a host that could never supply a
//! candidate's topics could never feed that scoring, which would leave
//! ADR-022's composer-side effect permanently inert on web specifically,
//! the same gap the seam's own amendment names as worse than a document
//! being briefly wrong. Flagged back to the seam's owner rather than
//! decided here.
//! DECISION PENDING: https://github.com/kihea/superb/issues/28

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use superb_core::Timestamp;
use superb_core::composer as core_composer;
use superb_core::engine as core_engine;
use superb_core::signals as core_signals;
use superb_core::state::WordState;

// ---------------------------------------------------------------------
// Host -> core: Request, Event, Frame, ContentFrame, Candidate, Slot, Pool
// ---------------------------------------------------------------------

/// `docs/seams.md`'s `Request`.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind")]
pub enum WireRequest {
    ProcessEvent { event: WireEvent },
    NextPassage,
}

impl From<WireRequest> for core_engine::Request {
    fn from(request: WireRequest) -> Self {
        match request {
            WireRequest::ProcessEvent { event } => core_engine::Request::ProcessEvent(event.into()),
            WireRequest::NextPassage => core_engine::Request::NextPassage,
        }
    }
}

/// `docs/seams.md`'s `Event`. Two fields are renamed relative to
/// `superb-core::signals::Event::ScreenDwell` on purpose: the seam calls
/// them `screen` and `words`, the core calls them `screen_id` and
/// `words_on_screen`. The seam is frozen and wins; the rename happens once,
/// here, rather than asking every host to know both names.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all_fields = "camelCase")]
pub enum WireEvent {
    DeckSwipe {
        item_id: String,
        is_pseudoword: bool,
        knew: bool,
    },
    GlossTap {
        word: String,
        passage: String,
        position: u32,
    },
    ProbeResult {
        word: String,
        assembled: bool,
        attempts: u32,
    },
    ScreenDwell {
        screen: String,
        words: Vec<String>,
        ms: u64,
    },
    PassageFinished {
        passage: String,
        words_seen: Vec<String>,
    },
    PassageAbandoned {
        passage: String,
        words_seen: Vec<String>,
    },
}

impl From<WireEvent> for core_signals::Event {
    fn from(event: WireEvent) -> Self {
        match event {
            WireEvent::DeckSwipe {
                item_id,
                is_pseudoword,
                knew,
            } => core_signals::Event::DeckSwipe {
                item_id,
                is_pseudoword,
                knew,
            },
            WireEvent::GlossTap {
                word,
                passage,
                position,
            } => core_signals::Event::GlossTap {
                word,
                passage,
                position,
            },
            WireEvent::ProbeResult {
                word,
                assembled,
                attempts,
            } => core_signals::Event::ProbeResult {
                word,
                assembled,
                attempts,
            },
            WireEvent::ScreenDwell { screen, words, ms } => core_signals::Event::ScreenDwell {
                screen_id: screen,
                words_on_screen: words,
                ms,
            },
            WireEvent::PassageFinished {
                passage,
                words_seen,
            } => core_signals::Event::PassageFinished {
                passage,
                words_seen,
            },
            WireEvent::PassageAbandoned {
                passage,
                words_seen,
            } => core_signals::Event::PassageAbandoned {
                passage,
                words_seen,
            },
        }
    }
}

/// `docs/seams.md`'s `Frame` — the host's answer to a `Needs`.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all_fields = "camelCase")]
pub enum WireFrame {
    Nothing,
    ItemDifficulty {
        difficulty: f64,
    },
    Content {
        content: WireContentFrame,
    },
    /// ADR-022 (docs/seams.md's 2026-07-25 amendment) — see this module's
    /// doc comment.
    Topics {
        topics: Vec<String>,
    },
}

impl From<WireFrame> for core_engine::Frame {
    fn from(frame: WireFrame) -> Self {
        match frame {
            WireFrame::Nothing => core_engine::Frame::Nothing,
            WireFrame::ItemDifficulty { difficulty } => {
                core_engine::Frame::ItemDifficulty { difficulty }
            }
            WireFrame::Content { content } => core_engine::Frame::Content(content.into()),
            WireFrame::Topics { topics } => core_engine::Frame::Topics { topics },
        }
    }
}

/// `docs/seams.md`'s `ContentFrame`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WireContentFrame {
    candidates: Vec<WireCandidate>,
    word_classes: BTreeMap<String, Vec<String>>,
    band_words: Vec<String>,
}

impl From<WireContentFrame> for core_composer::ContentFrame {
    fn from(frame: WireContentFrame) -> Self {
        core_composer::ContentFrame {
            candidates: frame.candidates.into_iter().map(Into::into).collect(),
            word_classes: frame
                .word_classes
                .into_iter()
                .map(|(word, classes)| (word, classes.into_iter().collect()))
                .collect(),
            band_words: frame.band_words,
        }
    }
}

/// `docs/seams.md`'s `Candidate`. Carries `topics`, not yet in the seam
/// document — see this module's doc comment for why this crate binds it
/// anyway (`composer::taste_multiplier` reads it) and the open question
/// that leaves.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WireCandidate {
    id: String,
    pool: WirePool,
    #[serde(default)]
    slots: Vec<WireSlot>,
    #[serde(default)]
    words: Vec<String>,
    #[serde(default)]
    topics: Vec<String>,
}

impl From<WireCandidate> for core_composer::Candidate {
    fn from(candidate: WireCandidate) -> Self {
        core_composer::Candidate {
            id: candidate.id,
            pool: candidate.pool.into(),
            slots: candidate.slots.into_iter().map(Into::into).collect(),
            words: candidate.words,
            topics: candidate.topics,
        }
    }
}

/// `docs/seams.md`'s `Candidate.slots[]` entry.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WireSlot {
    index: u32,
    class: String,
    default_word: String,
}

impl From<WireSlot> for core_composer::Slot {
    fn from(slot: WireSlot) -> Self {
        core_composer::Slot {
            index: slot.index,
            class: slot.class,
            default_word: slot.default_word,
        }
    }
}

/// `docs/seams.md`'s `Pool` — a plain two-value string union in TypeScript,
/// and a plain unit enum here for the same reason: neither variant carries
/// data, so serde's default (untagged, bare-string) representation for a
/// fieldless enum already produces `"Composed"` / `"Sourced"`, matching the
/// seam with no attributes at all.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum WirePool {
    Composed,
    Sourced,
}

impl From<WirePool> for core_composer::Pool {
    fn from(pool: WirePool) -> Self {
        match pool {
            WirePool::Composed => core_composer::Pool::Composed,
            WirePool::Sourced => core_composer::Pool::Sourced,
        }
    }
}

impl From<core_composer::Pool> for WirePool {
    fn from(pool: core_composer::Pool) -> Self {
        match pool {
            core_composer::Pool::Composed => WirePool::Composed,
            core_composer::Pool::Sourced => WirePool::Sourced,
        }
    }
}

// ---------------------------------------------------------------------
// Core -> host: Needs, Effect, Passage
// ---------------------------------------------------------------------

/// `docs/seams.md`'s `Needs`.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all_fields = "camelCase")]
pub enum WireNeeds {
    Nothing,
    ItemDifficulty {
        item_id: String,
    },
    PassageCandidates {
        due_words: Vec<String>,
        band_low: f64,
        band_high: f64,
    },
    /// ADR-022 (docs/seams.md's 2026-07-25 amendment) — see this module's
    /// doc comment.
    PassageTopics {
        passage: String,
    },
}

impl From<core_engine::Needs> for WireNeeds {
    fn from(needs: core_engine::Needs) -> Self {
        match needs {
            core_engine::Needs::Nothing => WireNeeds::Nothing,
            core_engine::Needs::ItemDifficulty { item_id } => WireNeeds::ItemDifficulty { item_id },
            core_engine::Needs::PassageCandidates {
                due_words,
                band_low,
                band_high,
            } => WireNeeds::PassageCandidates {
                due_words,
                band_low,
                band_high,
            },
            core_engine::Needs::PassageTopics { passage } => WireNeeds::PassageTopics { passage },
        }
    }
}

/// `WordState`'s public contract spelling (`src/state.rs`'s own doc
/// comment: "these strings appear in golden vectors and cross three FFI
/// boundaries"). `Effect::WordStateChanged`'s `from`/`to` cross as this
/// spelling, unchanged, rather than through a second casing convention this
/// crate would have to keep in sync with the first.
fn word_state_str(state: WordState) -> &'static str {
    match state {
        WordState::Unseen => "UNSEEN",
        WordState::Seeded => "SEEDED",
        WordState::Learning => "LEARNING",
        WordState::Consolidating => "CONSOLIDATING",
        WordState::Automatic => "AUTOMATIC",
    }
}

/// `docs/seams.md`'s `Effect`.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all_fields = "camelCase")]
pub enum WireEffect {
    WordStateChanged {
        word: String,
        from: &'static str,
        to: &'static str,
    },
    IntervalSet {
        word: String,
        due: u64,
    },
    ThetaUpdated {
        theta: f64,
        se: f64,
    },
    ProbeEligible {
        word: String,
    },
    ContextFrameLogged {
        word: String,
        frame_id: String,
    },
    PassageComposed {
        passage: WirePassage,
    },
    /// ADR-022 (docs/seams.md's 2026-07-25 amendment) — see this module's
    /// doc comment. **Crosses the boundary and is never rendered** (the
    /// seam's own words): filtering it out here would be this crate
    /// deciding what the host may know, the exact violation the seam exists
    /// to prevent. `finished`/`abandoned` are counts of the reader's own
    /// behaviour; a host that displays them is law 3's most tempting
    /// violation, not this crate's.
    TopicAffinityUpdated {
        topic: String,
        finished: u32,
        abandoned: u32,
    },
}

impl From<core_engine::Effect> for WireEffect {
    fn from(effect: core_engine::Effect) -> Self {
        match effect {
            core_engine::Effect::WordStateChanged { word, from, to } => {
                WireEffect::WordStateChanged {
                    word,
                    from: word_state_str(from),
                    to: word_state_str(to),
                }
            }
            core_engine::Effect::IntervalSet { word, due } => WireEffect::IntervalSet {
                word,
                due: due.millis_since_epoch(),
            },
            core_engine::Effect::ThetaUpdated { theta, se } => {
                WireEffect::ThetaUpdated { theta, se }
            }
            core_engine::Effect::ProbeEligible { word } => WireEffect::ProbeEligible { word },
            core_engine::Effect::ContextFrameLogged { word, frame_id } => {
                WireEffect::ContextFrameLogged { word, frame_id }
            }
            core_engine::Effect::PassageComposed { passage } => WireEffect::PassageComposed {
                passage: passage.into(),
            },
            core_engine::Effect::TopicAffinityUpdated {
                topic,
                finished,
                abandoned,
            } => WireEffect::TopicAffinityUpdated {
                topic,
                finished,
                abandoned,
            },
        }
    }
}

/// `docs/seams.md`'s `Passage`. Carries `topics`, not yet in the seam
/// document — see this module's doc comment for the open question this
/// leaves (unlike `Candidate.topics`, nothing in this crate reads
/// `Passage.topics` back; it is carried through only because
/// `composer::Passage` already has it).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WirePassage {
    id: String,
    pool: WirePool,
    topics: Vec<String>,
    fills: Vec<WireSlotFill>,
    targets: Vec<String>,
    seeded: Vec<String>,
}

impl From<core_composer::Passage> for WirePassage {
    fn from(passage: core_composer::Passage) -> Self {
        WirePassage {
            id: passage.id,
            pool: passage.pool.into(),
            topics: passage.topics,
            fills: passage.fills.into_iter().map(Into::into).collect(),
            targets: passage.targets,
            seeded: passage.seeded,
        }
    }
}

/// `docs/seams.md`'s `Passage.fills[]` entry.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WireSlotFill {
    index: u32,
    word: String,
}

impl From<core_composer::SlotFill> for WireSlotFill {
    fn from(fill: core_composer::SlotFill) -> Self {
        WireSlotFill {
            index: fill.index,
            word: fill.word,
        }
    }
}

/// `now_ms` (a JS number, milliseconds since the epoch) into the
/// `Timestamp` `superb-core` takes. The one unit conversion every `plan` and
/// `decide` call needs, in one place.
pub fn timestamp_from_ms(now_ms: f64) -> Timestamp {
    Timestamp::from_millis_since_epoch(now_ms as u64)
}

#[cfg(test)]
mod tests {
    //! Each assertion pins the exact wire string `docs/seams.md` promises —
    //! not just that serialization round-trips, but that it round-trips to
    //! *this* spelling. A wire format that changed shape but still
    //! round-tripped with itself would pass a weaker test and fail every
    //! host that reads `docs/seams.md` instead of this crate's source.

    use super::*;

    #[test]
    fn a_deck_swipe_request_matches_the_seam_exactly() {
        let json = r#"{"kind":"ProcessEvent","event":{"kind":"DeckSwipe","itemId":"aperture","isPseudoword":false,"knew":true}}"#;
        let request: WireRequest = serde_json::from_str(json).expect("parses");
        let core_request: core_engine::Request = request.into();
        assert_eq!(
            core_request,
            core_engine::Request::ProcessEvent(core_signals::Event::DeckSwipe {
                item_id: "aperture".to_string(),
                is_pseudoword: false,
                knew: true,
            })
        );
    }

    #[test]
    fn next_passage_has_no_event_field() {
        let json = r#"{"kind":"NextPassage"}"#;
        let request: WireRequest = serde_json::from_str(json).expect("parses");
        assert_eq!(
            core_engine::Request::from(request),
            core_engine::Request::NextPassage
        );
    }

    #[test]
    fn screen_dwell_renames_screen_id_and_words_on_screen() {
        let json = r#"{"kind":"ScreenDwell","screen":"deck-1","words":["aperture"],"ms":1200}"#;
        let event: WireEvent = serde_json::from_str(json).expect("parses");
        assert_eq!(
            core_signals::Event::from(event),
            core_signals::Event::ScreenDwell {
                screen_id: "deck-1".to_string(),
                words_on_screen: vec!["aperture".to_string()],
                ms: 1200,
            }
        );
    }

    #[test]
    fn a_content_frame_carries_word_classes_as_arrays() {
        let json = r#"{"kind":"Content","content":{"candidates":[{"id":"comp-1","pool":"Composed","slots":[{"index":0,"class":"adj.quality.light","defaultWord":"grey"}],"words":[],"topics":["sea"]}],"wordClasses":{"grey":["adj.quality.light"]},"bandWords":["quiet"]}}"#;
        let frame: WireFrame = serde_json::from_str(json).expect("parses");
        let core_frame: core_engine::Frame = frame.into();
        let core_engine::Frame::Content(content) = core_frame else {
            panic!("expected Frame::Content");
        };
        assert_eq!(content.candidates.len(), 1);
        assert_eq!(content.candidates[0].pool, core_composer::Pool::Composed);
        assert_eq!(content.candidates[0].topics, vec!["sea".to_string()]);
        assert_eq!(content.word_classes.get("grey").map(|c| c.len()), Some(1));
        assert_eq!(content.band_words, vec!["quiet".to_string()]);
    }

    #[test]
    fn passage_topics_needs_serializes_to_the_extended_shape() {
        let needs = WireNeeds::from(core_engine::Needs::PassageTopics {
            passage: "comp-1".to_string(),
        });
        assert_eq!(
            serde_json::to_string(&needs).expect("serializes"),
            r#"{"kind":"PassageTopics","passage":"comp-1"}"#
        );
    }

    #[test]
    fn item_difficulty_needs_matches_the_seam_exactly() {
        let needs = WireNeeds::from(core_engine::Needs::ItemDifficulty {
            item_id: "aperture".to_string(),
        });
        assert_eq!(
            serde_json::to_string(&needs).expect("serializes"),
            r#"{"kind":"ItemDifficulty","itemId":"aperture"}"#
        );
    }

    #[test]
    fn passage_candidates_needs_matches_the_seam_exactly() {
        let needs = WireNeeds::from(core_engine::Needs::PassageCandidates {
            due_words: vec!["aperture".to_string()],
            band_low: -1.0,
            band_high: 1.0,
        });
        assert_eq!(
            serde_json::to_string(&needs).expect("serializes"),
            r#"{"kind":"PassageCandidates","dueWords":["aperture"],"bandLow":-1.0,"bandHigh":1.0}"#
        );
    }

    #[test]
    fn word_state_changed_effect_matches_the_seam_exactly() {
        let effect = WireEffect::from(core_engine::Effect::WordStateChanged {
            word: "aperture".to_string(),
            from: WordState::Unseen,
            to: WordState::Seeded,
        });
        assert_eq!(
            serde_json::to_string(&effect).expect("serializes"),
            r#"{"kind":"WordStateChanged","word":"aperture","from":"UNSEEN","to":"SEEDED"}"#
        );
    }

    #[test]
    fn interval_set_effect_carries_due_as_a_plain_number() {
        let effect = WireEffect::from(core_engine::Effect::IntervalSet {
            word: "aperture".to_string(),
            due: Timestamp::from_millis_since_epoch(1_735_776_000_000),
        });
        assert_eq!(
            serde_json::to_string(&effect).expect("serializes"),
            r#"{"kind":"IntervalSet","word":"aperture","due":1735776000000}"#
        );
    }

    #[test]
    fn theta_updated_effect_matches_the_seam_exactly() {
        let effect = WireEffect::from(core_engine::Effect::ThetaUpdated {
            theta: 0.5,
            se: 0.9,
        });
        assert_eq!(
            serde_json::to_string(&effect).expect("serializes"),
            r#"{"kind":"ThetaUpdated","theta":0.5,"se":0.9}"#
        );
    }

    #[test]
    fn context_frame_logged_effect_matches_the_seam_exactly() {
        let effect = WireEffect::from(core_engine::Effect::ContextFrameLogged {
            word: "aperture".to_string(),
            frame_id: "comp-1".to_string(),
        });
        assert_eq!(
            serde_json::to_string(&effect).expect("serializes"),
            r#"{"kind":"ContextFrameLogged","word":"aperture","frameId":"comp-1"}"#
        );
    }

    #[test]
    fn topic_affinity_updated_effect_serializes_to_the_extended_shape() {
        let effect = WireEffect::from(core_engine::Effect::TopicAffinityUpdated {
            topic: "sea".to_string(),
            finished: 2,
            abandoned: 1,
        });
        assert_eq!(
            serde_json::to_string(&effect).expect("serializes"),
            r#"{"kind":"TopicAffinityUpdated","topic":"sea","finished":2,"abandoned":1}"#
        );
    }

    #[test]
    fn passage_composed_effect_matches_the_seam_exactly() {
        let passage = core_composer::Passage {
            id: "comp-1".to_string(),
            pool: core_composer::Pool::Composed,
            topics: vec!["sea".to_string()],
            fills: vec![core_composer::SlotFill {
                index: 0,
                word: "grey".to_string(),
            }],
            targets: vec!["grey".to_string()],
            seeded: vec![],
        };
        let effect = WireEffect::from(core_engine::Effect::PassageComposed { passage });
        assert_eq!(
            serde_json::to_string(&effect).expect("serializes"),
            r#"{"kind":"PassageComposed","passage":{"id":"comp-1","pool":"Composed","topics":["sea"],"fills":[{"index":0,"word":"grey"}],"targets":["grey"],"seeded":[]}}"#
        );
    }

    #[test]
    fn timestamp_from_ms_truncates_toward_zero() {
        assert_eq!(
            timestamp_from_ms(1_735_776_000_000.0).millis_since_epoch(),
            1_735_776_000_000
        );
    }
}
