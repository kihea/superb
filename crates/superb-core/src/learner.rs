//! The persisted root: one learner's whole history, in one document.
//!
//! `docs/engine-contract.md` §1.5 makes state serialization a public
//! contract — it crosses FFI, it is what Settings exports (ASK-004), and it
//! must survive app upgrades on three platforms. ADR-016 specifies exactly
//! how: one version number, on an envelope around the document, readable
//! before the payload is parsed. This module is that envelope and that
//! payload, at version 1.
//!
//! Three obligations this module exists to discharge, each checkable and
//! each tested here rather than assumed:
//!
//! 1. **Every persisted document carries `v: 1`**, and the version is
//!    readable without the rest of the document having to parse — the
//!    two-pass load ADR-016 Decision 1 specifies. [`LearnerState::load`]
//!    probes `v` from generic JSON before it ever tries to build a
//!    [`LearnerState`], so an unreadable payload cannot stop the one
//!    question the probe exists to answer.
//! 2. **The loader is total over versions** (ADR-016 Decision 2): an
//!    unrecognised `v` is a typed [`LoadError::UnknownVersion`] naming the
//!    number it saw, never a panic and never a partial parse.
//! 3. **Content this build has never heard of survives a round trip**
//!    (ADR-016's amendment, ADR-018 Decision 5). Word ids and context frame
//!    ids are opaque strings to this crate — there is no catalogue here to
//!    check them against — so nothing in this module *can* drop one; the
//!    tests exist to keep that true on purpose rather than by accident.
//!
//! A fourth thing this module writes but does not decide: every export
//! carries a one-sentence `_note` field saying in plain words what the
//! document is and that it belongs to its reader (BRIEF-008's review,
//! finding F3). It is declared and stripped by [`LearnerState::load`] by
//! name, the same way `v` is, so its presence never trips
//! `deny_unknown_fields` and its content is never read back by the app
//! (law 3) — an export is not a surface, it is what a reader gets when they
//! ask for their own data.
//!
//! What this module deliberately does not do: decide anything. No function
//! here computes a due date, chooses a word, or updates θ — that is the
//! scheduler's brief, not this one. This module stores state; it does not
//! reason about it.

use std::collections::BTreeMap;

use core::fmt;

use serde::{Deserialize, Serialize};

use crate::state::WordState;

/// Milliseconds since the Unix epoch, supplied by the host.
///
/// Purity law 1 (engine-contract §1) forbids a clock inside this crate, so
/// time is a plain value the host hands in, never `std::time::SystemTime`,
/// `std::time::Instant`, nor a `chrono` type — any of which would make this
/// crate's output depend on when it happened to run.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Timestamp(u64);

impl Timestamp {
    /// Build a `Timestamp` from milliseconds since the Unix epoch. The host
    /// is the only caller with a clock to read one from.
    pub const fn from_millis_since_epoch(millis: u64) -> Self {
        Self(millis)
    }

    /// The value back out, in the same units it was given in.
    pub const fn millis_since_epoch(self) -> u64 {
        self.0
    }
}

/// Everything a learner's history holds about one word.
///
/// Deciding what any of this *means* — whether the word is due, which
/// context it should be met in next — is the scheduler's job. This is only
/// the record.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WordRecord {
    /// Where the word stands (`src/state.rs`).
    pub state: WordState,
    /// When the word is next due, in milliseconds since the Unix epoch. Named
    /// with its unit rather than plain `due`: read cold, in an export a
    /// learner opened themselves, a bare `due: 1785024000000` names nothing
    /// (BRIEF-008's review, finding F3; ASK-004 promises the export is
    /// legible to its owner, not just parseable).
    ///
    /// Private to this module, on purpose (BRIEF-009's review, finding F3):
    /// see [`WordRecord::due_epoch_ms`] to read it and
    /// [`WordRecord::set_due_and_interval`] for the one way to change it.
    due_epoch_ms: Timestamp,
    /// How many times the learner has met this word.
    pub encounters: u32,
    /// Ids of the context frames this word has already been met in
    /// (engine-contract §2 and §4 — a word never reuses one of its previous
    /// contexts). Opaque strings to this crate: the content catalogue lives
    /// in the host's data, not here, and a passage or excerpt this build no
    /// longer ships (ADR-018 — content is revocable at any time) is still a
    /// context this word was genuinely met in, so its id is kept rather than
    /// dropped.
    pub context_frames: Vec<String>,
    /// The interval, in days, that produced `due_epoch_ms` — stored rather
    /// than derived (BRIEF-009's ARCHITECT'S ANSWER: deriving it from
    /// `due_epoch_ms - now` compresses the schedule for every reader who
    /// reads ahead of it, and deriving it from `state` and `encounters`
    /// makes every interval a function of whichever `tuning.toml` happens to
    /// be shipping today, turning an ordinary constant edit into a silent
    /// retroactive migration).
    ///
    /// `None` for a word that has never been scheduled, rather than `0.0`:
    /// zero is not a valid interval (every scheduled interval is strictly
    /// positive) and would read as a real, if minimal, spacing decision
    /// instead of the absence of one. `#[serde(skip_serializing_if)]` carries
    /// that choice into the exported document too — a word with no interval
    /// simply has no `interval_days` key, which is legible to a learner
    /// reading their own export (ASK-004) without a sentinel value to
    /// decode.
    ///
    /// Private to this module, same reason and same fix as `due_epoch_ms`:
    /// see [`WordRecord::interval_days`] and
    /// [`WordRecord::set_due_and_interval`]. BRIEF-009's review (finding F3)
    /// constructed a compiling, two-line violation — `record.due_epoch_ms =
    /// x;` alone, leaving the old interval in place — of the rule directly
    /// below this comment, back when both fields were `pub` and the rule
    /// lived only in this sentence. It is enforced by the type now: there is
    /// no method on `WordRecord` that sets one of these two fields without
    /// the other, so that line no longer compiles anywhere outside this
    /// module.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    interval_days: Option<f64>,
}

impl WordRecord {
    /// Build a record from its whole content at once. `due_epoch_ms` and
    /// `interval_days` are parameters here for the same reason
    /// [`WordRecord::set_due_and_interval`] is the only way to change them
    /// later: a record is never assembled with one written and the other
    /// left stale.
    pub fn new(
        state: WordState,
        due_epoch_ms: Timestamp,
        encounters: u32,
        context_frames: Vec<String>,
        interval_days: Option<f64>,
    ) -> Self {
        Self {
            state,
            due_epoch_ms,
            encounters,
            context_frames,
            interval_days,
        }
    }

    /// When the word is next due. Read-only outside this module — see
    /// [`WordRecord::set_due_and_interval`] to change it.
    pub fn due_epoch_ms(&self) -> Timestamp {
        self.due_epoch_ms
    }

    /// The interval, in days, that produced [`WordRecord::due_epoch_ms`], or
    /// `None` for a word that has never been scheduled. Read-only outside
    /// this module — see [`WordRecord::set_due_and_interval`] to change it.
    pub fn interval_days(&self) -> Option<f64> {
        self.interval_days
    }

    /// The one way to change `due_epoch_ms` or `interval_days` after a
    /// record is built. `src/scheduler.rs` is the only caller, and it calls
    /// this with both halves of a `ScheduleDecision` on every scheduling
    /// decision.
    ///
    /// This is the fix for BRIEF-009's review, finding F3: the two fields
    /// used to be `pub`, and "the two are written together or the record is
    /// inconsistent" (the ARCHITECT'S ANSWER) lived in a doc comment a
    /// caller could ignore by writing `record.due_epoch_ms = x` alone — which
    /// the review did, and it compiled. With both fields private to this
    /// module and no other mutator, that line has no field to write to
    /// anymore: the guarantee is carried by privacy, not by a comment.
    pub fn set_due_and_interval(&mut self, due_epoch_ms: Timestamp, interval_days: f64) {
        self.due_epoch_ms = due_epoch_ms;
        self.interval_days = Some(interval_days);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::WordState;

    /// F3: the accessors must read back exactly what
    /// `set_due_and_interval` wrote, together, in one call — the same call
    /// that is now the only way to change either field.
    #[test]
    fn accessors_agree_with_what_set_due_and_interval_wrote() {
        let mut record = WordRecord::new(
            WordState::Learning,
            Timestamp::from_millis_since_epoch(0),
            1,
            Vec::new(),
            None,
        );
        assert_eq!(record.due_epoch_ms(), Timestamp::from_millis_since_epoch(0));
        assert_eq!(record.interval_days(), None);

        let due = Timestamp::from_millis_since_epoch(123_456);
        record.set_due_and_interval(due, 7.5);

        assert_eq!(record.due_epoch_ms(), due);
        assert_eq!(record.interval_days(), Some(7.5));
    }
}

/// One learner's whole history — the persisted root engine-contract §1.5
/// names.
///
/// At v1: the seed and draw counter that make every random draw this
/// learner has ever received explicit and replayable (purity law 2 — the
/// core never owns an RNG; a draw is a counter advancing in state, not a
/// call to one), θ and its standard error, one record per word the learner
/// has met, and an affinity per topic.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LearnerState {
    /// The learner's RNG seed. Never advanced or reseeded by this crate —
    /// only read alongside `draw_count` to reproduce a draw.
    pub seed: u64,
    /// How many draws have been made from `seed` so far. Advancing this is
    /// how the core spends a draw instead of calling an RNG (purity law 2).
    pub draw_count: u64,
    /// The learner's estimated ability.
    pub theta: f64,
    /// θ's standard error.
    pub theta_se: f64,
    /// Word id (opaque to this crate) to that word's record.
    pub words: BTreeMap<String, WordRecord>,
    /// Topic id (opaque to this crate) to the learner's affinity for it.
    pub topic_affinities: BTreeMap<String, f64>,
}

/// The sentence written into every exported document, in the reader's own
/// words rather than the engine's: what the file is, and that it is theirs
/// (ASK-004; BRIEF-008's review, finding F3). Fixed rather than authored per
/// document — the app never reads an export back to its owner (law 3;
/// ADR-016's ADVISORY-001 §4 amendment), so there is nothing for the note to
/// vary with.
const EXPORT_NOTE: &str = "This is your Superb data — the words you've encountered and when \
    each is due again — and it belongs entirely to you to open, read, or copy.";

/// The version-1 write shape: `v` first, then the reader-facing note, then
/// the rest of [`LearnerState`] flattened beside them (ADR-016 Decision 1 —
/// the version is the persisted document's first field, readable without
/// parsing the payload).
///
/// Serialize-only, and deliberately never the type [`LearnerState::load`]
/// deserializes through: `#[serde(flatten)]` cannot be combined with
/// `#[serde(deny_unknown_fields)]`, and the loader's deny-unknown-fields
/// promise has to hold on the payload itself. The loader reads `v` and
/// `_note` from generic JSON by hand instead — see [`LearnerState::load`].
#[derive(Debug, Serialize)]
struct EnvelopeV1<'a> {
    v: u32,
    #[serde(rename = "_note")]
    note: &'static str,
    #[serde(flatten)]
    state: &'a LearnerState,
}

/// Why a persisted document failed to load.
///
/// One variant per way the two-pass load (ADR-016 Decision 1) can refuse a
/// document, so a caller — and a test — can assert on exactly what went
/// wrong rather than on an error string. `load` is total over every
/// document this covers: it never panics.
#[derive(Debug, Clone, PartialEq)]
pub enum LoadError {
    /// The input was not syntactically valid JSON at all — truncated, or
    /// otherwise malformed.
    NotJson(String),
    /// The document parsed as JSON but was not an object, or had no `v`
    /// field to probe.
    MissingVersion,
    /// `v` was present but was not an unsigned integer (for example, a
    /// string).
    VersionNotAnInteger,
    /// `v` was a well-formed version number, but this build does not
    /// support it (ADR-016 Decision 2 — the loader is total over versions).
    UnknownVersion(u64),
    /// `v` named a version this build supports, but the rest of the
    /// document does not match that version's schema — the wrong shape, or
    /// a field this build does not recognise (ADR-016 Decision 2 — unknown
    /// fields inside a known version are an error, not ignored).
    Malformed {
        /// The version whose schema the payload was checked against.
        version: u64,
        /// What `serde_json` reported.
        message: String,
    },
}

impl fmt::Display for LoadError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LoadError::NotJson(message) => write!(f, "not valid JSON: {message}"),
            LoadError::MissingVersion => write!(f, "document has no readable \"v\" field"),
            LoadError::VersionNotAnInteger => {
                write!(f, "\"v\" is present but is not an unsigned integer")
            }
            LoadError::UnknownVersion(found) => {
                write!(f, "unsupported version {found}; this build supports v1")
            }
            LoadError::Malformed { version, message } => {
                write!(
                    f,
                    "v{version} document does not match its schema: {message}"
                )
            }
        }
    }
}

impl core::error::Error for LoadError {}

impl LearnerState {
    /// Read a persisted document, total over every version this build
    /// supports and every one it does not (ADR-016 Decision 2). Never
    /// panics.
    ///
    /// Two passes, exactly as ADR-016 Decision 1 specifies: probe `v` from
    /// the document as generic JSON, so a payload that does not parse into
    /// any known shape still cannot stop the probe from answering the one
    /// question it exists to answer; then dispatch on the version found and
    /// parse the rest with the type that version describes.
    pub fn load(document: &str) -> Result<LearnerState, LoadError> {
        let mut root: serde_json::Value = serde_json::from_str(document)
            .map_err(|error| LoadError::NotJson(error.to_string()))?;

        let object = root.as_object_mut().ok_or(LoadError::MissingVersion)?;
        let v_value = object.remove("v").ok_or(LoadError::MissingVersion)?;
        let version = v_value.as_u64().ok_or(LoadError::VersionNotAnInteger)?;

        // `_note` is declared, not unknown (ADR-016 Decision 2): it explains
        // the document to a reader who opened it by hand and carries no data
        // this crate acts on, so it is dropped here — exactly like `v` — by
        // name, rather than being parsed into `LearnerState` or falling
        // through to `deny_unknown_fields` and rejecting the document.
        object.remove("_note");

        match version {
            1 => serde_json::from_value(root).map_err(|error| LoadError::Malformed {
                version: 1,
                message: error.to_string(),
            }),
            other => Err(LoadError::UnknownVersion(other)),
        }
    }

    /// Write this state as the version-1 persisted document: pretty-printed,
    /// `v` first, every other key in the stable order this struct's own
    /// field order and `BTreeMap`'s sorted iteration give it.
    ///
    /// This *is* the export ASK-004 promises the learner can open and read —
    /// not a rendering of it (ADR-016's ADVISORY-001 §4 amendment) — so the
    /// formatting is not cosmetic.
    pub fn to_document(&self) -> String {
        let envelope = EnvelopeV1 {
            v: 1,
            note: EXPORT_NOTE,
            state: self,
        };
        let pretty =
            serde_json::to_string_pretty(&envelope).expect("LearnerState always serializes");
        format!("{pretty}\n")
    }
}
