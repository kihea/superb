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
use crate::tuning::Tuning;

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

/// One encounter with a word, in one context: the frame id it was met in,
/// and whether that encounter was clean.
///
/// Both questions live on one entry because they must never be able to
/// disagree (`src/engine.rs`'s ARCHITECT'S ANSWER, BRIEF-013 round 3, on the
/// contradiction in round 2's own answer — "counting raw `context_frames`
/// would advance a word on precisely the encounters the same answer forbade
/// from advancing it"). [`WordRecord::context_frames`] reads every
/// `frame_id`, regardless of `clean`, for engine-contract §4's variation
/// guarantee — a reader who has already met a word in a context should not
/// meet it there again, whether or not that meeting went well. `src/engine.rs`'s
/// progression thresholds (`consolidating_threshold`, `encounter_target`)
/// count only the distinct `frame_id`s where `clean` is `true`: a gloss tap
/// still proves the word was served in a new context, but it is this crate's
/// strongest negative signal, and letting it also advance a word toward
/// automaticity would make the schedule reward confusion.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ContextEncounter {
    /// The passage or excerpt id the word was met in. Opaque to this crate:
    /// the content catalogue lives in the host's data, not here, and a
    /// passage or excerpt this build no longer ships (ADR-018 — content is
    /// revocable at any time) is still a context this word was genuinely met
    /// in, so its id is kept rather than dropped.
    pub frame_id: String,
    /// Whether this encounter was a clean pass
    /// (`crate::scheduler::EncounterOutcome::Clean`) — never a gloss tap, a
    /// failed probe, or a passage abandoned before it finished.
    pub clean: bool,
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
    /// Every context this word has been met in, most recent last
    /// (engine-contract §2 and §4 — a word never reuses one of its previous
    /// contexts). See [`ContextEncounter`] for why one entry carries both the
    /// variation guarantee's question and the progression thresholds'.
    pub context_frames: Vec<ContextEncounter>,
    /// The interval, in days, that produced `due_epoch_ms` — stored rather
    /// than derived (BRIEF-009's ARCHITECT'S ANSWER: deriving it from
    /// `due_epoch_ms - now` compresses the schedule for every reader who
    /// reads ahead of it, and deriving it from `state` and how many times the
    /// word has been met makes every interval a function of whichever
    /// `tuning.toml` happens to be shipping today, turning an ordinary
    /// constant edit into a silent retroactive migration).
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
        context_frames: Vec<ContextEncounter>,
        interval_days: Option<f64>,
    ) -> Self {
        Self {
            state,
            due_epoch_ms,
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
/// call to one), θ and the accumulated Fisher information behind it, one
/// record per word the learner has met, and an affinity per topic.
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
    ///
    /// Private to this module (docs/engine-contract.md law 6, added after
    /// this brief's own review — round two). `theta` used to be `pub`, and
    /// [`crate::ability::update_theta`] clamps it to `[tuning.theta_min,
    /// tuning.theta_max]` before it ever hands a new value back — but a
    /// `pub` field lets any caller walk around that clamp: writing
    /// `state.theta = 500.0;` compiled, and emptied the theta band exactly
    /// as a `NaN` would, the failure the crate's own no-NaN property test
    /// exists to prevent, arriving through the front door instead. See
    /// [`LearnerState::theta`] to read it and
    /// [`LearnerState::set_theta_and_se`] for the one way to change it.
    theta: f64,
    /// θ's accumulated Fisher information — how much evidence has sharpened
    /// this estimate, not the uncertainty itself. `theta_se()` derives the
    /// standard error from this on every read, as `1 / sqrt(theta_information)`,
    /// rather than this crate storing both: two fields that must agree by
    /// construction are two fields that can silently disagree, and a stored
    /// `theta_se` that decayed by a constant factor on every observation
    /// (independent of this same total) was exactly that disagreement —
    /// engine-contract §5's amendment (BRIEF-014 round 2) closes it by
    /// keeping only the one number that is actually evidence.
    ///
    /// Private to this module for the same reason as `theta`: the
    /// non-increasing property [`crate::ability::update_theta`] maintains
    /// (engine-contract §5) is a guarantee a public field lets a caller
    /// write around. See [`LearnerState::theta_information`],
    /// [`LearnerState::theta_se`], and
    /// [`LearnerState::set_theta_and_information`].
    theta_information: f64,
<<<<<<< HEAD
    /// How many pseudowords this learner has been shown, and how many of
    /// those they claimed to know. Together they are the over-claim rate
    /// [`crate::ability::overclaim_correction`] spends.
    ///
    /// **Two counts rather than one stored rate, for the same reason
    /// [`TopicRecord`] keeps two.** A stored rate cannot tell "claimed the
    /// only pseudoword they have ever seen" from "claimed twenty of
    /// twenty," and the correction those two deserve is not the same
    /// confidence. Keeping the counts means the rate is derived on every
    /// read and there is no second number that can drift from the evidence
    /// it summarises.
    ///
    /// **`serde(default)` on purpose.** A v1 document written before these
    /// existed loads with both at zero, which is exactly right rather than
    /// merely convenient: a learner with no recorded pseudoword history
    /// earns no correction, so an old state's θ reads back unchanged. The
    /// v1 fixture round-trips without a migration step.
    ///
    /// Private for the same reason `theta` is (engine-contract law 6): the
    /// invariant `overclaimed <= seen` is one a public field lets a caller
    /// write around. See [`LearnerState::record_pseudoword`] and
    /// [`LearnerState::overclaim_rate`].
    /// **`skip_serializing_if` as well as `default`, and that pair is what
    /// keeps ADR-016 at v1.** A counter at zero writes no key at all, so a
    /// learner who has never met a pseudoword — every learner persisted
    /// before these fields existed, and every fresh one — serializes to
    /// exactly the bytes v1 always produced. The frozen v1 fixture
    /// round-trips byte-identically, which is the check that would
    /// otherwise have demanded a version bump and a migration for two
    /// counters that start at zero and mean "nothing has happened yet."
    /// Same judgment `WordRecord::interval_days` already makes for the same
    /// reason: absence is the honest encoding of "there is nothing here,"
    /// and it reads that way in an export its owner opens (ASK-004).
    #[serde(default, skip_serializing_if = "is_zero")]
    pseudowords_seen: u64,
    #[serde(default, skip_serializing_if = "is_zero")]
    pseudowords_overclaimed: u64,
=======
>>>>>>> main
    /// Word id (opaque to this crate) to that word's record.
    pub words: BTreeMap<String, WordRecord>,
    /// Topic id (opaque to this crate) to what this reader has done with it.
    ///
    /// Written only by `engine::decide`, from `PassageFinished` and
    /// `PassageAbandoned` — the two signals engine-contract §3 names and
    /// nothing else (ADR-022 D1).
    pub topic_affinities: BTreeMap<String, TopicRecord>,
}

<<<<<<< HEAD
/// `serde`'s `skip_serializing_if` wants a predicate over a reference; this
/// is that predicate for the pseudoword counters, whose zero means "nothing
/// has happened yet" rather than a measured zero.
fn is_zero(count: &u64) -> bool {
    *count == 0
}

=======
>>>>>>> main
/// What one reader has done with one topic: how many passages about it they
/// read to the end, and how many they left.
///
/// **Two counts rather than one rate, and the reason is the whole of ADR-022
/// D3.** A stored rate cannot tell "they loved this, twelve for twelve" from
/// "they finished the one we tried" — and the difference between those is
/// exactly what decides whether the composer should lean on the signal or go
/// looking for more. The denominator has to survive into the record or the
/// exploration bonus has nothing to compute from.
///
/// Deliberately not a score, a rating, or anything the reader ever sees. Law 3:
/// this is honest evidence only because they have no idea it is being kept.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct TopicRecord {
    /// Passages about this topic the reader read to the end.
    pub finished: u32,
    /// Passages about this topic the reader left.
    pub abandoned: u32,
}

impl TopicRecord {
    /// How many passages about this topic the reader has met at all.
    pub fn trials(&self) -> u32 {
        self.finished.saturating_add(self.abandoned)
    }

    /// The share read to the end, or `None` for a topic never tried.
    ///
    /// `None` rather than a default of 0.0 or 0.5, because "never tried" is a
    /// different claim from "tried and disliked" and the caller has to handle
    /// it differently — ADR-022 D3 gives an untried topic the *maximum* value,
    /// which a silent default would quietly turn into the average one.
    pub fn rate(&self) -> Option<f64> {
        match self.trials() {
            0 => None,
            trials => Some(f64::from(self.finished) / f64::from(trials)),
        }
    }
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

/// Why [`LearnerState::set_theta_and_information`] refused to write θ and
/// its accumulated Fisher information (docs/engine-contract.md law 6).
///
/// One variant per boundary the mutator checks, so a failing test — or a
/// caller — can assert on exactly what was refused rather than on "it
/// errored." Neither case is silently repaired here: `theta` is already
/// clamped once, inside [`crate::ability::update_theta`], and
/// `theta_information` is already kept positive and non-decreasing there; a
/// second, silent clamp or floor at this boundary would hide a caller's bug
/// — a value that did not come from `update_theta` — instead of reporting
/// it.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SetThetaError {
    /// `theta` was outside `[min, max]`, or was not finite (including
    /// `NaN`, which compares false against every bound and would otherwise
    /// slip through a plain `<`/`>` check).
    ThetaOutOfRange { theta: f64, min: f64, max: f64 },
    /// `theta_information` was not strictly positive, or was not finite —
    /// this crate's own derived standard error is `1 / sqrt(theta_information)`,
    /// so a non-positive or non-finite value here would make that division
    /// undefined or infinite, which no accumulated evidence
    /// [`crate::ability::update_theta`] produces ever is.
    InformationNotPositive { theta_information: f64 },
}

impl fmt::Display for SetThetaError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SetThetaError::ThetaOutOfRange { theta, min, max } => {
                write!(f, "theta {theta} is outside [{min}, {max}]")
            }
            SetThetaError::InformationNotPositive { theta_information } => {
                write!(
                    f,
                    "theta_information {theta_information} is not strictly positive"
                )
            }
        }
    }
}

impl core::error::Error for SetThetaError {}

impl LearnerState {
    /// Build a `LearnerState` from its whole content at once — the same
    /// shape [`WordRecord::new`] takes, for the same reason: every field is
    /// a parameter, so nothing is ever assembled with `theta` written and
    /// `theta_information` left stale, or the reverse.
    ///
    /// This does not range-check `theta` against `tuning.theta_min` /
    /// `theta_max`, nor `theta_information` for strict positivity — building
    /// a whole learner history by hand (a test, a simulator seeding a
    /// synthetic learner) is not the boundary docs/engine-contract.md law 6
    /// is about; the guarantee that matters is that nothing can change
    /// `theta` or `theta_information` on a `LearnerState` that already
    /// exists except through [`LearnerState::set_theta_and_information`]. See
    /// that method for the one call that does validate. A caller building a
    /// genuinely fresh learner should pass `tuning.theta_prior_information()`
    /// here — the constant that exists expressly so a brand-new estimate is
    /// never mistaken for a certain one.
    pub fn new(
        seed: u64,
        draw_count: u64,
        theta: f64,
        theta_information: f64,
        words: BTreeMap<String, WordRecord>,
        topic_affinities: BTreeMap<String, TopicRecord>,
    ) -> Self {
        Self {
            seed,
            draw_count,
            theta,
            theta_information,
<<<<<<< HEAD
            pseudowords_seen: 0,
            pseudowords_overclaimed: 0,
=======
>>>>>>> main
            words,
            topic_affinities,
        }
    }

<<<<<<< HEAD
    /// The learner's ability estimate: the raw θ the estimator maintains,
    /// less the over-claim correction the pseudoword counters have earned,
    /// clamped back into `[tuning.theta_min, tuning.theta_max]`.
    ///
    /// **This is the number every consumer wants**, and it takes `tuning`
    /// precisely so that it cannot be confused with
    /// [`LearnerState::theta_raw`] by anyone reaching for the shorter name.
    /// Derived on every read rather than stored, the same discipline
    /// [`LearnerState::theta_se`] follows and for the same reason: a stored
    /// corrected θ would be a second number that could disagree with the
    /// counters it was computed from.
    ///
    /// The one caller that must *not* use this is the estimator's own
    /// recursion — feeding a corrected θ back into
    /// [`crate::ability::update_theta`] would apply the correction again on
    /// every swipe, compounding it into exactly the runaway this fix
    /// removed. That caller uses [`LearnerState::theta_raw`], and the
    /// asymmetry in the names is the guard.
    pub fn theta(&self, tuning: &crate::tuning::Tuning) -> f64 {
        let corrected = self.theta
            - crate::ability::overclaim_correction(
                self.pseudowords_seen,
                self.pseudowords_overclaimed,
                tuning,
            );
        corrected.max(tuning.theta_min).min(tuning.theta_max)
    }

    /// The raw ability estimate, before the over-claim correction — what
    /// [`crate::ability::update_theta`] wrote and what it must read back for
    /// the next observation. Almost every other caller wants
    /// [`LearnerState::theta`].
    pub fn theta_raw(&self) -> f64 {
        self.theta
    }

    /// How many pseudowords this learner has met, and how many they claimed.
    pub fn pseudowords_seen(&self) -> u64 {
        self.pseudowords_seen
    }

    /// See [`LearnerState::pseudowords_seen`].
    pub fn pseudowords_overclaimed(&self) -> u64 {
        self.pseudowords_overclaimed
    }

    /// The observed over-claim rate, derived from the two counters — `0.0`
    /// for a learner who has never met a pseudoword, never a division by
    /// zero.
    pub fn overclaim_rate(&self) -> f64 {
        if self.pseudowords_seen == 0 {
            0.0
        } else {
            (self.pseudowords_overclaimed as f64) / (self.pseudowords_seen as f64)
        }
    }

    /// Record one pseudoword having been put in front of this learner, and
    /// whether they claimed to know it.
    ///
    /// The only way either counter changes, so `overclaimed <= seen` holds
    /// by construction rather than by every caller remembering to bump both.
    /// Saturating rather than wrapping: a `u64` of pseudoword swipes is not
    /// reachable by a reader, but wrapping to zero would silently erase a
    /// learner's whole over-claim history, and saturating merely stops
    /// counting.
    pub fn record_pseudoword(&mut self, overclaimed: bool) {
        self.pseudowords_seen = self.pseudowords_seen.saturating_add(1);
        if overclaimed {
            self.pseudowords_overclaimed = self.pseudowords_overclaimed.saturating_add(1);
        }
    }

=======
    /// The learner's current ability estimate. Read-only outside this
    /// module — see [`LearnerState::set_theta_and_information`] to change
    /// it.
    pub fn theta(&self) -> f64 {
        self.theta
    }

>>>>>>> main
    /// θ's raw accumulated Fisher information — how much evidence
    /// [`crate::ability::update_theta`] has folded into this estimate so
    /// far. Read-only outside this module; most callers want
    /// [`LearnerState::theta_se`] instead. See
    /// [`LearnerState::set_theta_and_information`] to change it.
    pub fn theta_information(&self) -> f64 {
        self.theta_information
    }

    /// θ's standard error, derived on every read as
    /// `1 / sqrt(theta_information)` (engine-contract §5's amendment,
    /// BRIEF-014 round 2) — never stored as its own field, so there is
    /// nothing here that can disagree with `theta_information`.
    pub fn theta_se(&self) -> f64 {
        1.0 / self.theta_information.sqrt()
    }

    /// The one way to change `theta` or `theta_information` after a
    /// `LearnerState` is built. Validates rather than clamps
    /// (docs/engine-contract.md law 6): `theta` must already lie in
    /// `[tuning.theta_min, tuning.theta_max]` and `theta_information` must
    /// already be strictly positive and finite, or this returns a
    /// [`SetThetaError`] and writes nothing — both fields are left exactly
    /// as they were.
    ///
    /// [`crate::ability::update_theta`] always produces values that satisfy
    /// both checks, so its caller writing `ThetaUpdate::theta` and
    /// `ThetaUpdate::theta_information` straight back through this method
    /// never sees an error in practice; the error exists for the caller who
    /// did not go through `update_theta` at all, which this method is the
    /// one place that can still catch.
    pub fn set_theta_and_information(
        &mut self,
        theta: f64,
        theta_information: f64,
        tuning: &Tuning,
    ) -> Result<(), SetThetaError> {
        if !theta.is_finite() || theta < tuning.theta_min || theta > tuning.theta_max {
            return Err(SetThetaError::ThetaOutOfRange {
                theta,
                min: tuning.theta_min,
                max: tuning.theta_max,
            });
        }
        if !theta_information.is_finite() || theta_information <= 0.0 {
            return Err(SetThetaError::InformationNotPositive { theta_information });
        }

        self.theta = theta;
        self.theta_information = theta_information;
        Ok(())
    }

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

#[cfg(test)]
mod theta_privacy_tests {
    use super::*;
    use crate::tuning::Tuning;
    use std::collections::BTreeMap;

    /// docs/engine-contract.md law 6: the accessors must read back exactly
    /// what `set_theta_and_information` wrote, together, in one call — the
    /// same call that is now the only way to change either field. `theta_se`
    /// is checked too, derived from the same write rather than a second one.
    #[test]
    fn accessors_agree_with_what_set_theta_and_information_wrote() {
        let tuning = Tuning::default();
        let mut state = LearnerState::new(0, 0, 0.0, 1.0, BTreeMap::new(), BTreeMap::new());
<<<<<<< HEAD
        assert_eq!(state.theta_raw(), 0.0);
=======
        assert_eq!(state.theta(), 0.0);
>>>>>>> main
        assert_eq!(state.theta_information(), 1.0);
        assert_eq!(state.theta_se(), 1.0);

        state
            .set_theta_and_information(0.42, 4.0, &tuning)
            .expect("0.42 is inside the shipped theta range and 4.0 is strictly positive");

<<<<<<< HEAD
        assert_eq!(state.theta_raw(), 0.42);
=======
        assert_eq!(state.theta(), 0.42);
>>>>>>> main
        assert_eq!(state.theta_information(), 4.0);
        assert_eq!(state.theta_se(), 0.5);
    }

    /// The mutator refuses an out-of-band θ rather than clamping it
    /// silently — `update_theta` already clamps once, and a second silent
    /// clamp here would hide a caller's bug instead of reporting it.
    #[test]
    fn set_theta_and_information_rejects_an_out_of_band_theta() {
        let tuning = Tuning::default();
        let mut state = LearnerState::new(0, 0, 0.0, 1.0, BTreeMap::new(), BTreeMap::new());

        let result = state.set_theta_and_information(500.0, 1.0, &tuning);

        assert_eq!(
            result,
            Err(SetThetaError::ThetaOutOfRange {
                theta: 500.0,
                min: tuning.theta_min,
                max: tuning.theta_max,
            })
        );
        // Refused, so nothing was written.
<<<<<<< HEAD
        assert_eq!(state.theta_raw(), 0.0);
=======
        assert_eq!(state.theta(), 0.0);
>>>>>>> main
        assert_eq!(state.theta_information(), 1.0);
    }

    /// The same refusal, for a non-positive accumulated information — the
    /// value that would make the derived `theta_se` undefined or infinite.
    #[test]
    fn set_theta_and_information_rejects_a_non_positive_information() {
        let tuning = Tuning::default();
        let mut state = LearnerState::new(0, 0, 0.0, 1.0, BTreeMap::new(), BTreeMap::new());

        let result = state.set_theta_and_information(0.0, -0.5, &tuning);

        assert_eq!(
            result,
            Err(SetThetaError::InformationNotPositive {
                theta_information: -0.5
            })
        );
<<<<<<< HEAD
        assert_eq!(state.theta_raw(), 0.0);
=======
        assert_eq!(state.theta(), 0.0);
>>>>>>> main
        assert_eq!(state.theta_information(), 1.0);

        let zero_result = state.set_theta_and_information(0.0, 0.0, &tuning);
        assert_eq!(
            zero_result,
            Err(SetThetaError::InformationNotPositive {
                theta_information: 0.0
            })
        );
    }
}
