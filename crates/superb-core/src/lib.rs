//! The Superb engine.
//!
//! Everything the product decides happens here, and nothing else does. The
//! crate is pure: no clock, no random number generator, no file, no socket, no
//! thread. `now` and seeds arrive as parameters. That purity is not tidiness —
//! it is what lets sixty simulated sessions run in milliseconds, lets a
//! scheduling bug be reproduced from a timestamp, and lets one implementation
//! serve WebAssembly, JNI, and Swift FFI without a platform shim.
//!
//! See `docs/engine-contract.md` in the development repository for the
//! contract this crate is written against.

#![forbid(unsafe_code)]

pub mod ability;
pub mod composer;
pub mod engine;
pub mod learner;
pub mod scheduler;
pub mod signals;
pub mod state;
pub mod tuning;

pub use ability::{ThetaUpdate, band, update_theta};
pub use composer::{Candidate, ContentFrame, Passage, Pool, Slot, SlotFill, compose};
pub use engine::{Effect, Frame, Needs, Outcome, Request, decide, plan};
pub use learner::{
    ContextEncounter, LearnerState, LoadError, SetThetaError, Timestamp, TopicRecord, WordRecord,
};
pub use scheduler::{
    EncounterOutcome, IntervalSet, ScheduleDecision, backlog_active, due_words, schedule_encounter,
};
pub use signals::{Direction, Event, Signal, rank};
pub use state::{IllegalTransition, Transition, WordState, WordStateChanged};
pub use tuning::{Affinity, PoolAffinity, Tuning, TuningError};
