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
    /// When the word is next due.
    pub due: Timestamp,
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

/// The version-1 write shape: `v` first, the rest of [`LearnerState`]
/// flattened beside it (ADR-016 Decision 1 — the version is the persisted
/// document's first field, readable without parsing the payload).
///
/// Serialize-only, and deliberately never the type [`LearnerState::load`]
/// deserializes through: `#[serde(flatten)]` cannot be combined with
/// `#[serde(deny_unknown_fields)]`, and the loader's deny-unknown-fields
/// promise has to hold on the payload itself. The loader reads `v` from
/// generic JSON by hand instead — see [`LearnerState::load`].
#[derive(Debug, Serialize)]
struct EnvelopeV1<'a> {
    v: u32,
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
        let envelope = EnvelopeV1 { v: 1, state: self };
        let pretty =
            serde_json::to_string_pretty(&envelope).expect("LearnerState always serializes");
        format!("{pretty}\n")
    }
}
