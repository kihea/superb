//! Where a word stands for a learner, and how it is allowed to move.
//!
//! This module exists to make one class of bug impossible rather than rare: a
//! state change the product does not believe in being reported as though it
//! happened. Everything else in the engine — scheduling, ability estimation,
//! composition — reads and writes these five states, so an unchecked
//! transition here would be laundered into every downstream decision.

use core::fmt;

use serde::{Deserialize, Serialize};

/// Where one word stands for one learner.
///
/// The variants are ordered, and the order is load-bearing: a word never skips
/// a state on the way up, so "how far along is this word" is answerable from
/// this value alone, with no second field to keep in sync.
///
/// Serializes as the upper-snake spelling of the variant name — `"UNSEEN"`,
/// `"SEEDED"`, and so on. These strings appear in golden vectors and cross
/// three FFI boundaries, so they are a public contract; a numeric discriminant
/// would silently change meaning the day a variant is inserted.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WordState {
    /// The learner has never met this word inside Superb.
    Unseen,
    /// Met once, in the onboarding deck or a first passage. Nothing is known
    /// yet about whether it stuck.
    Seeded,
    /// Being acquired. Encounters are scheduled close together and the word is
    /// eligible for the strongest signals.
    Learning,
    /// Recognised reliably, but not yet without effort. Intervals lengthen and
    /// the word starts to be worth meeting in the wild.
    Consolidating,
    /// Understood without deliberate retrieval. The word stops being scheduled
    /// and only reappears incidentally — which is also how a lapse is caught.
    Automatic,
}

impl WordState {
    /// Position in the progression, counted from [`WordState::Unseen`].
    ///
    /// Exists so a caller can say "this advanced by exactly one" without
    /// restating the transition table it is checking against.
    pub const fn rank(self) -> u8 {
        match self {
            WordState::Unseen => 0,
            WordState::Seeded => 1,
            WordState::Learning => 2,
            WordState::Consolidating => 3,
            WordState::Automatic => 4,
        }
    }

    /// Apply a transition, or refuse it.
    ///
    /// This is the only way to produce a [`WordStateChanged`], which is what
    /// makes an illegal transition unrepresentable in the effect stream rather
    /// than merely untested. The match over the pair is exhaustive and has no
    /// wildcard arm, so adding a state or a transition breaks the build here
    /// first — at the one place where the decision has to be made again.
    ///
    /// ```
    /// use superb_core::state::{Transition, WordState};
    ///
    /// let change = WordState::Unseen.apply(Transition::Seeded).unwrap();
    /// assert_eq!(change.from(), WordState::Unseen);
    /// assert_eq!(change.to(), WordState::Seeded);
    ///
    /// assert!(WordState::Unseen.apply(Transition::Automated).is_err());
    /// ```
    ///
    /// A change cannot be built by hand, only earned:
    ///
    /// ```compile_fail
    /// use superb_core::state::{WordState, WordStateChanged};
    ///
    /// let forged = WordStateChanged {
    ///     from: WordState::Unseen,
    ///     to: WordState::Automatic,
    /// };
    /// ```
    pub fn apply(self, transition: Transition) -> Result<WordStateChanged, IllegalTransition> {
        let to = match (self, transition) {
            (WordState::Unseen, Transition::Seeded) => WordState::Seeded,
            (WordState::Seeded, Transition::LearningBegun) => WordState::Learning,
            (WordState::Learning, Transition::Consolidated) => WordState::Consolidating,
            (WordState::Consolidating, Transition::Automated) => WordState::Automatic,
            (WordState::Consolidating, Transition::Lapsed) => WordState::Learning,
            (WordState::Automatic, Transition::Lapsed) => WordState::Learning,

            // The refusals, enumerated rather than wildcarded, so a new
            // variant cannot slip into this arm and be silently rejected.
            (
                WordState::Unseen,
                Transition::LearningBegun
                | Transition::Consolidated
                | Transition::Automated
                | Transition::Lapsed,
            )
            | (
                WordState::Seeded,
                Transition::Seeded
                | Transition::Consolidated
                | Transition::Automated
                | Transition::Lapsed,
            )
            | (
                WordState::Learning,
                Transition::Seeded
                | Transition::LearningBegun
                | Transition::Automated
                | Transition::Lapsed,
            )
            | (
                WordState::Consolidating,
                Transition::Seeded | Transition::LearningBegun | Transition::Consolidated,
            )
            | (
                WordState::Automatic,
                Transition::Seeded
                | Transition::LearningBegun
                | Transition::Consolidated
                | Transition::Automated,
            ) => {
                return Err(IllegalTransition {
                    from: self,
                    transition,
                });
            }
        };

        Ok(WordStateChanged { from: self, to })
    }
}

/// Something that happened to a word, named for the event rather than for the
/// state it lands in.
///
/// Naming these after the event keeps the scheduler honest: it reports what it
/// observed and the state machine decides what that means, which is the only
/// arrangement in which the transition table can stay the single place the
/// progression is defined.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Transition {
    /// First contact — the deck or a first passage put the word in front of
    /// the learner.
    Seeded,
    /// Evidence arrived that the word is not yet known, so acquisition starts.
    LearningBegun,
    /// Retrieval succeeded often enough that spacing can widen.
    Consolidated,
    /// Retrieval stopped costing effort.
    Automated,
    /// A word that had settled came apart again — a gloss tap on something
    /// that should have been automatic, or a failed probe.
    Lapsed,
}

/// A state change that actually occurred.
///
/// Fields are private and there is no constructor: the only way to hold one of
/// these is to have called [`WordState::apply`] and been told yes. That is the
/// whole mechanism behind "illegal transitions are unrepresentable" — the type
/// is a receipt, not a request.
///
/// Deliberately `Serialize` but not `Deserialize`. Effects are written to
/// golden vectors and read by hosts; letting one be rebuilt from JSON would
/// hand back exactly the forgery the private fields prevent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
pub struct WordStateChanged {
    from: WordState,
    to: WordState,
}

impl WordStateChanged {
    /// Where the word stood before.
    pub const fn from(self) -> WordState {
        self.from
    }

    /// Where it stands now. Never equal to [`WordStateChanged::from`] — the
    /// table has no self-loops, so an effect always means something moved.
    pub const fn to(self) -> WordState {
        self.to
    }
}

/// A transition that was refused, carrying enough to say why without a lookup.
///
/// Refusal is information: a scheduler that keeps producing these is reasoning
/// about a word from stale state, and this is where that shows up first.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
pub struct IllegalTransition {
    /// The state the word was actually in.
    pub from: WordState,
    /// The transition that does not apply to it.
    pub transition: Transition,
}

impl fmt::Display for IllegalTransition {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?} cannot {:?}", self.from, self.transition)
    }
}

impl core::error::Error for IllegalTransition {}
