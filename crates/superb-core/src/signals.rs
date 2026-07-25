//! Turning raw behaviour into evidence about one word (BRIEF-011).
//!
//! `docs/engine-contract.md` §3's events table names five events and gives
//! each a "Signal strength." This module is that column, executable:
//! [`Event`] is the table's rows, typed, carrying exactly the payload each
//! names; [`rank`] is the strength, computed from [`Tuning`] rather than
//! eyeballed.
//!
//! **What `rank` decides, and what it deliberately does not.** Three of the
//! five events carry a within-session strength a caller can order against
//! the others: `ProbeResult` (strongest positive when the probe assembled
//! correctly — or, on a failed probe, tied with `GlossTap` at strongest
//! negative, matching `crate::scheduler::EncounterOutcome`'s own doc
//! comment: "the reader tapped the gloss, *or a probe failed* — the
//! strongest negative signal"), `GlossTap` (strongest negative), and
//! `ScreenDwell` (weak negative, and only ever that — see below). The other
//! two return [`None`], not because they carry no information, but because
//! what they carry is not *this* kind of evidence:
//!
//! - `DeckSwipe` is engine-contract §3's "calibration seed" — it feeds
//!   `crate::ability::update_theta` directly (once a later brief wires the
//!   deck to it), never a within-session [`Signal`] competing with a probe
//!   or a gloss-tap for a word's schedule.
//! - `PassageAbandoned` "produces a topic-affinity update and no word-level
//!   signal" (this brief's own Done clause, read literally): a reader who
//!   stopped reading told you about the passage, not about any word in it.
//! - `PassageFinished`'s "clean pass" is
//!   `crate::scheduler::EncounterOutcome::Clean` — a per-word scheduler
//!   outcome a later brief fans out over `words_seen`, not a [`Signal`]:
//!   `words_seen` is a passage's worth of words, `rank` only ever names
//!   *one*, and a whole-passage event forced into a single `Signal` would
//!   have to guess which word among many it was "about" — the exact
//!   ambiguity `ScreenDwell`'s own attribution rule refuses to guess
//!   through, below.
//!
//! **The attribution rule, restated because it is the clause most likely to
//! be softened.** `ScreenDwell` returns `Some` only when `words_on_screen`
//! holds *exactly* one entry. Two target words on the same screen and a
//! slow read is not evidence about either of them — there is no way to
//! know which one cost the time — and the engine would rather say nothing
//! than guess. Zero target words is not evidence about anything by
//! construction. The check is the list's raw length: `rank` reads the
//! whole event once and answers once, so nothing about the list — not its
//! length, not a duplicate entry inside it — can be worked around by
//! asking a second time.
//!
//! **Why a gloss-tap is honest evidence at all.** Law 3 (`CLAUDE.md`) never
//! marks a target word on screen: no highlight, no underline, nothing that
//! tells a reader in advance which words the schedule is watching. A tap on
//! a gloss is therefore never a tap the app primed — it is the reader's
//! own, unprompted admission that this particular word, among every word on
//! the page, was the one they needed help with. Mark target words and a
//! gloss-tap stops meaning that: it becomes a tap on the word the app told
//! them to distrust, a different and much weaker fact. The next person to
//! propose "highlight words you're learning" should read this paragraph
//! first — the highlight would not sit peaceably beside this signal, it
//! would quietly destroy it.
//!
//! **Strengths** are read from `tuning.toml`'s
//! `signal_strength_probe_positive`, `signal_strength_negative_strong`, and
//! `signal_strength_dwell_negative` — named and range-checked in
//! `src/tuning.rs`, and provisional in exactly the sense
//! `docs/engine-contract.md` §3 says every tuning constant is, until the
//! simulator has run. Nothing here pins a strength to a value; the ordering
//! — `signal_strength_probe_positive > signal_strength_negative_strong >
//! signal_strength_dwell_negative > 0` — is the thing this module
//! guarantees, and `Tuning::validate` refuses any file that would invert it
//! (docs/engine-contract.md §1 law 6: invariants are structural), so the
//! ordering property holds for every legal edit to the file, not only
//! today's numbers.
//!
//! **Purity (engine-contract §1).** [`rank`] reads only `event` and
//! `tuning`; no clock, no RNG, no I/O, and nothing hidden.

use serde::{Deserialize, Serialize};

use crate::tuning::Tuning;

/// One thing the host reported happening, carrying exactly the payload
/// engine-contract §3's events table names for it — no more.
///
/// Boundary tier in `wire-roster.toml`: the host constructs and sends these
/// across FFI (engine-contract §3's event stream in); an `Event` is never
/// reachable from [`crate::LearnerState`] and carries no migration
/// obligation of its own.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Event {
    /// The onboarding deck: one item swiped, real word or pseudoword,
    /// claimed known or not. engine-contract §3's "calibration seed" — see
    /// this module's doc comment for why [`rank`] never turns one into a
    /// [`Signal`].
    DeckSwipe {
        /// The deck item's id — a word id for a real word, or a
        /// pseudoword's own id. Opaque to this crate either way.
        item_id: String,
        /// Whether `item_id` names a pseudoword rather than a real word.
        is_pseudoword: bool,
        /// Whether the reader claimed to know it.
        knew: bool,
    },
    /// The reader tapped a word's gloss while reading. engine-contract §3's
    /// strongest negative signal — see this module's doc comment for why
    /// that is honest evidence rather than a coaxed one.
    GlossTap {
        /// The word whose gloss was tapped.
        word: String,
        /// The passage (or excerpt) id the tap happened in.
        passage: String,
        /// Where in the passage the tap landed.
        position: u32,
    },
    /// A probe was presented and either assembled correctly or not.
    ProbeResult {
        /// The word the probe was about.
        word: String,
        /// Whether the reader assembled it correctly.
        assembled: bool,
        /// How many attempts it took.
        attempts: u32,
    },
    /// How long a screen held the reader, and which target words it
    /// carried. Weak negative, and only ever attributable when exactly one
    /// target word was on screen — see this module's doc comment.
    ScreenDwell {
        /// The screen this dwell was measured on.
        screen_id: String,
        /// The target words the schedule placed on this screen — not every
        /// word visible, only the ones the schedule is watching.
        words_on_screen: Vec<String>,
        /// How long the reader stayed, in milliseconds.
        ms: u64,
    },
    /// A passage was read to its end. engine-contract §3's "clean pass" —
    /// see this module's doc comment for why `rank` still returns `None`.
    PassageFinished {
        /// The passage that was finished.
        passage: String,
        /// The target words it carried.
        words_seen: Vec<String>,
    },
    /// A passage was left unfinished. engine-contract §3's "topic-affinity
    /// update" — never a word-level signal (this module's Done clause, read
    /// literally: a reader who stopped reading told you about the passage,
    /// not about any word in it).
    PassageAbandoned {
        /// The passage that was abandoned.
        passage: String,
        /// The target words it carried.
        words_seen: Vec<String>,
    },
}

/// Which way a [`Signal`] points: evidence the reader knows the word, or
/// evidence they do not.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    /// Evidence the reader knows the word.
    For,
    /// Evidence the reader does not — or not yet, automatically.
    Against,
}

/// One event, turned into evidence about one word.
///
/// Fields are private and the only way to hold one is [`rank`]
/// (docs/engine-contract.md §1 law 6): `strength` is not a bare `f64` a
/// caller could set to whatever value it likes later, because the property
/// this module exists to guarantee — `ProbeResult` outranks `GlossTap`
/// outranks `ScreenDwell` — is a fact about what `rank` reads from
/// [`Tuning`], not a fact this type could still vouch for once it is
/// unmoored from the call that produced it. There is no public constructor.
#[derive(Debug, Clone, PartialEq)]
pub struct Signal {
    word: String,
    direction: Direction,
    strength: f64,
}

impl Signal {
    fn new(word: String, direction: Direction, strength: f64) -> Self {
        Self {
            word,
            direction,
            strength,
        }
    }

    /// The word this is evidence about.
    pub fn word(&self) -> &str {
        &self.word
    }

    /// Which way the evidence points.
    pub fn direction(&self) -> Direction {
        self.direction
    }

    /// How much the evidence is worth — always positive; [`Direction`]
    /// carries the sign, so two signals are compared on this field alone
    /// regardless of which way either one points (this brief's Done clause:
    /// "the ordering... comparing strengths pairwise").
    pub fn strength(&self) -> f64 {
        self.strength
    }
}

/// Turn one event into evidence about one word, or refuse to.
///
/// Pure (engine-contract §1): `event` and `tuning` are the whole input, and
/// nothing outside them is read. Total (this brief's own property): every
/// [`Event`] variant and every payload it can carry — including an empty
/// `words_on_screen`, an empty `words_seen`, and a zero-millisecond dwell —
/// returns without panicking.
///
/// `DeckSwipe`, `PassageFinished`, and `PassageAbandoned` always return
/// `None`; see this module's doc comment for why each is a real thing the
/// engine knows without being a within-session `Signal`. The other three
/// return `Some` exactly when the payload attributes to one word:
/// `GlossTap` and `ProbeResult` always do, because their payload already
/// names one; `ScreenDwell` does only when `words_on_screen` holds exactly
/// one entry — checked on the list's raw length, so a screen naming zero,
/// two, or many target words is refused identically.
pub fn rank(event: &Event, tuning: &Tuning) -> Option<Signal> {
    match event {
        Event::DeckSwipe { .. } => None,

        Event::GlossTap { word, .. } => Some(Signal::new(
            word.clone(),
            Direction::Against,
            tuning.signal_strength_negative_strong,
        )),

        Event::ProbeResult {
            word, assembled, ..
        } => Some(if *assembled {
            Signal::new(
                word.clone(),
                Direction::For,
                tuning.signal_strength_probe_positive,
            )
        } else {
            Signal::new(
                word.clone(),
                Direction::Against,
                tuning.signal_strength_negative_strong,
            )
        }),

        Event::ScreenDwell {
            words_on_screen, ..
        } => match words_on_screen.as_slice() {
            [only] => Some(Signal::new(
                only.clone(),
                Direction::Against,
                tuning.signal_strength_dwell_negative,
            )),
            _ => None,
        },

        Event::PassageFinished { .. } => None,
        Event::PassageAbandoned { .. } => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Done clause 3, the headline: the ordering is asserted as an
    /// ordering — comparing strengths pairwise — never by asserting a
    /// magic number. `ProbeResult` (assembled) outranks `GlossTap`
    /// outranks `ScreenDwell` (one target word), on the shipped tuning.
    /// The property version, over every legal `Tuning`, lives in
    /// `tests/signals_properties.rs`.
    #[test]
    fn probe_outranks_gloss_tap_outranks_screen_dwell_on_the_shipped_tuning() {
        let tuning = Tuning::default();

        let probe = rank(
            &Event::ProbeResult {
                word: "aperture".to_string(),
                assembled: true,
                attempts: 1,
            },
            &tuning,
        )
        .expect("an assembled probe produces a signal");

        let gloss = rank(
            &Event::GlossTap {
                word: "aperture".to_string(),
                passage: "p1".to_string(),
                position: 0,
            },
            &tuning,
        )
        .expect("a gloss tap produces a signal");

        let dwell = rank(
            &Event::ScreenDwell {
                screen_id: "s1".to_string(),
                words_on_screen: vec!["aperture".to_string()],
                ms: 9_000,
            },
            &tuning,
        )
        .expect("a dwell on a single-target screen produces a signal");

        assert!(
            probe.strength() > gloss.strength(),
            "probe {} should outrank gloss {}",
            probe.strength(),
            gloss.strength()
        );
        assert!(
            gloss.strength() > dwell.strength(),
            "gloss {} should outrank dwell {}",
            gloss.strength(),
            dwell.strength()
        );
    }

    /// A failed probe is tied with a gloss tap at strongest negative
    /// (`crate::scheduler::EncounterOutcome`'s own doc comment), not a
    /// fourth, separate rung on the ladder.
    #[test]
    fn a_failed_probe_matches_a_gloss_tap_exactly() {
        let tuning = Tuning::default();

        let failed_probe = rank(
            &Event::ProbeResult {
                word: "aperture".to_string(),
                assembled: false,
                attempts: 2,
            },
            &tuning,
        )
        .expect("a failed probe produces a signal");

        let gloss = rank(
            &Event::GlossTap {
                word: "aperture".to_string(),
                passage: "p1".to_string(),
                position: 0,
            },
            &tuning,
        )
        .expect("a gloss tap produces a signal");

        assert_eq!(failed_probe.strength(), gloss.strength());
        assert_eq!(failed_probe.direction(), Direction::Against);
        assert_eq!(gloss.direction(), Direction::Against);
    }

    /// Done clause 4, the other headline: `None` for zero, two, and many
    /// target words on screen.
    #[test]
    fn screen_dwell_is_none_unless_exactly_one_target_word_is_on_screen() {
        let tuning = Tuning::default();

        for words in [
            Vec::<String>::new(),
            vec!["a".to_string(), "b".to_string()],
            vec![
                "a".to_string(),
                "b".to_string(),
                "c".to_string(),
                "d".to_string(),
            ],
        ] {
            let event = Event::ScreenDwell {
                screen_id: "s1".to_string(),
                words_on_screen: words.clone(),
                ms: 5_000,
            };
            assert_eq!(
                rank(&event, &tuning),
                None,
                "{} target words should not be attributable",
                words.len()
            );
        }
    }

    /// The same rule, defeated the way a caller could otherwise slip past
    /// it: the same word appearing twice does not collapse to "one target
    /// word" — the list's raw length governs, so this stays `None` and a
    /// caller cannot double-count the one word by asking `rank` about a
    /// two-entry list that happens to repeat.
    #[test]
    fn a_repeated_word_on_screen_is_still_two_target_words() {
        let tuning = Tuning::default();
        let event = Event::ScreenDwell {
            screen_id: "s1".to_string(),
            words_on_screen: vec!["aperture".to_string(), "aperture".to_string()],
            ms: 5_000,
        };

        assert_eq!(rank(&event, &tuning), None);
    }

    #[test]
    fn screen_dwell_produces_a_signal_for_exactly_one_target_word() {
        let tuning = Tuning::default();
        let event = Event::ScreenDwell {
            screen_id: "s1".to_string(),
            words_on_screen: vec!["aperture".to_string()],
            ms: 5_000,
        };

        let signal = rank(&event, &tuning).expect("exactly one target word is attributable");
        assert_eq!(signal.word(), "aperture");
        assert_eq!(signal.direction(), Direction::Against);
        assert_eq!(signal.strength(), tuning.signal_strength_dwell_negative);
    }

    /// `DeckSwipe` is a calibration seed, never a within-session `Signal` —
    /// true regardless of the payload.
    #[test]
    fn deck_swipe_never_produces_a_signal() {
        let tuning = Tuning::default();

        for is_pseudoword in [true, false] {
            for knew in [true, false] {
                let event = Event::DeckSwipe {
                    item_id: "item-1".to_string(),
                    is_pseudoword,
                    knew,
                };
                assert_eq!(rank(&event, &tuning), None);
            }
        }
    }

    /// A finished passage's "clean pass" is `EncounterOutcome::Clean`, fanned
    /// out per word by a later brief — never a `Signal` here, since a
    /// passage names many words and `rank` only ever names one.
    #[test]
    fn passage_finished_never_produces_a_signal() {
        let tuning = Tuning::default();
        let event = Event::PassageFinished {
            passage: "p1".to_string(),
            words_seen: vec!["aperture".to_string(), "lucid".to_string()],
        };

        assert_eq!(rank(&event, &tuning), None);
    }

    /// Done clause 5, read literally: an abandoned passage produces a
    /// topic-affinity update and no word-level signal.
    #[test]
    fn passage_abandoned_never_produces_a_signal() {
        let tuning = Tuning::default();
        let event = Event::PassageAbandoned {
            passage: "p1".to_string(),
            words_seen: vec!["aperture".to_string(), "lucid".to_string()],
        };

        assert_eq!(rank(&event, &tuning), None);
    }

    /// Verifier: an empty `words_seen` on either passage event, and an
    /// empty `item_id`, do not panic — a lighter-weight instance of the
    /// totality property `tests/signals_properties.rs` checks broadly.
    #[test]
    fn empty_payloads_do_not_panic() {
        let tuning = Tuning::default();

        assert_eq!(
            rank(
                &Event::PassageFinished {
                    passage: String::new(),
                    words_seen: Vec::new(),
                },
                &tuning
            ),
            None
        );
        assert_eq!(
            rank(
                &Event::PassageAbandoned {
                    passage: String::new(),
                    words_seen: Vec::new(),
                },
                &tuning
            ),
            None
        );
        assert_eq!(
            rank(
                &Event::ScreenDwell {
                    screen_id: String::new(),
                    words_on_screen: Vec::new(),
                    ms: 0,
                },
                &tuning
            ),
            None
        );
    }
}
