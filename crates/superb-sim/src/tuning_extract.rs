//! Reading ADR-015's composer constants back out of a live `Tuning`, without
//! a new `pub` accessor on `superb_core::tuning::Tuning`.
//!
//! **Why this module exists at all.** Assertion 5 asks this crate to
//! "simulate the pool choice — mark a fixture subset 'sourced' and apply the
//! table and multiplier at selection" (`src/composer.rs` is where that
//! happens). ADR-015's scoring function reads four things `Tuning` carries —
//! `coverage_decay`, `sourced_preference`, `min_sourced_coverage`, and the
//! state-by-pool affinity table — and every one of them is `pub(crate)`
//! inside `superb-core`, on purpose (engine-contract §1 law 6: `Tuning`'s
//! own `validate` is exactly the shape `tests/structural_invariants.rs`
//! polices, and the brief's own scope line is explicit: "`superb-core`'s
//! public API. If the simulator cannot work through the existing surface,
//! that is an UNRESOLVED and a finding about BRIEF-013" — not a green light
//! to add accessors here.
//!
//! **The surface this uses instead already exists and is already
//! authorized.** `wire-roster.toml` lists `Tuning` as boundary tier,
//! carrying `Serialize` + `Deserialize`, with the consumer named
//! explicitly: "the simulator overrides tuning.toml wholesale... `Serialize`
//! also... backs the round-trip stability test." A `Serialize` impl on a
//! type with private fields is ordinary serde — the derive expands inside
//! `superb-core`'s own `tuning` module, so it sees `pub(crate)` fields
//! exactly as any other code in that module would, and the *impl* it
//! produces is `pub`. Calling `serde_json::to_value(&tuning)` from outside
//! the crate reads every field through that already-public trait, not
//! through Rust's own field-visibility rules — no new engine surface, no
//! new dependency (`serde_json` is already a `superb-core` dependency;
//! `Tuning: Serialize` is already authorized for exactly this shape of
//! read).
//!
//! **What this buys over hand-copying the numbers into this crate.** A
//! hand-copied `coverage_decay = 0.75` here would silently drift from
//! `tuning.toml` the day someone edits the file for a simulator run (the
//! Verifier's own instruction: "change one tuning constant and confirm the
//! report diff moves") — exactly the failure this module is built to make
//! impossible. Every constant this crate's composer stub reads comes from
//! the same `Tuning` value that is actually driving `engine::decide` in the
//! same run, every time.

use serde_json::Value;
use superb_core::state::WordState;
use superb_core::tuning::Tuning;

/// The ADR-015 constants this crate's composer stub needs, read once per
/// `Tuning` and held as plain values for the rest of this crate to use
/// without repeating the `serde_json::Value` plumbing at every call site.
#[derive(Debug, Clone, Copy)]
pub struct AdrConstants {
    pub coverage_decay: f64,
    pub sourced_preference: f64,
    pub min_sourced_coverage: usize,
    /// Reported alongside Assertion 3/5's empirical due-list maximum for
    /// context — not read by `composer.rs`'s own logic, which asks
    /// `superb_core::backlog_active` the guard question directly rather than
    /// re-implementing its threshold comparison out here.
    pub backlog_override_due: usize,
    affinity: Affinity,
}

#[derive(Debug, Clone, Copy)]
struct Affinity {
    seeded: (f64, f64),
    learning: (f64, f64),
    consolidating: (f64, f64),
    automatic: (f64, f64),
}

impl AdrConstants {
    /// Extract every ADR-015 constant `tuning` carries, through its own
    /// `Serialize` impl — see this module's own doc comment for why this is
    /// the whole mechanism.
    pub fn from_tuning(tuning: &Tuning) -> Self {
        let value = serde_json::to_value(tuning)
            .expect("Tuning::Serialize is total (BRIEF-007's own round-trip test proves it)");

        let coverage_decay = field_f64(&value, "coverage_decay");
        let sourced_preference = field_f64(&value, "sourced_preference");
        let min_sourced_coverage = field_u64(&value, "min_sourced_coverage") as usize;
        let backlog_override_due = field_u64(&value, "backlog_override_due") as usize;

        let affinity_value = value
            .get("affinity")
            .unwrap_or_else(|| panic!("Tuning's serialized form has no \"affinity\" table"));
        let affinity = Affinity {
            seeded: pool_pair(affinity_value, "seeded"),
            learning: pool_pair(affinity_value, "learning"),
            consolidating: pool_pair(affinity_value, "consolidating"),
            automatic: pool_pair(affinity_value, "automatic"),
        };

        Self {
            coverage_decay,
            sourced_preference,
            min_sourced_coverage,
            backlog_override_due,
            affinity,
        }
    }

    /// A word's worth to the composer's score, in the given state, met in
    /// the given pool (ADR-015's table). `WordState::Unseen` has no entry —
    /// "an unseen word is not yet a candidate for either pool"
    /// (`superb_core::tuning`'s own doc comment) — and this crate's
    /// composer stub never scores an unseen word (`src/composer.rs`), so
    /// this panics rather than guessing a value nothing should ever ask for.
    pub fn affinity_for(&self, state: WordState, pool: Pool) -> f64 {
        let (composed, sourced) = match state {
            WordState::Seeded => self.affinity.seeded,
            WordState::Learning => self.affinity.learning,
            WordState::Consolidating => self.affinity.consolidating,
            WordState::Automatic => self.affinity.automatic,
            WordState::Unseen => panic!(
                "affinity_for(Unseen, ..) — an unseen word is never a scored coverage candidate"
            ),
        };
        match pool {
            Pool::Composed => composed,
            Pool::Sourced => sourced,
        }
    }
}

/// Which of ADR-009's two pools a candidate would be drawn from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Pool {
    Composed,
    Sourced,
}

fn field_f64(value: &Value, key: &str) -> f64 {
    value
        .get(key)
        .unwrap_or_else(|| panic!("Tuning's serialized form has no \"{key}\" field"))
        .as_f64()
        .unwrap_or_else(|| panic!("Tuning's \"{key}\" field is not a number"))
}

fn field_u64(value: &Value, key: &str) -> u64 {
    value
        .get(key)
        .unwrap_or_else(|| panic!("Tuning's serialized form has no \"{key}\" field"))
        .as_u64()
        .unwrap_or_else(|| panic!("Tuning's \"{key}\" field is not an unsigned integer"))
}

/// `(composed, sourced)` for one affinity table row, keyed by its
/// `tuning.toml` table name (`"seeded"`, `"learning"`, `"consolidating"`,
/// `"automatic"`).
fn pool_pair(affinity_value: &Value, row: &str) -> (f64, f64) {
    let row_value = affinity_value
        .get(row)
        .unwrap_or_else(|| panic!("Tuning's affinity table has no \"{row}\" row"));
    (
        field_f64(row_value, "composed"),
        field_f64(row_value, "sourced"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_shipped_constants_off_the_default_tuning() {
        let tuning = Tuning::default();
        let constants = AdrConstants::from_tuning(&tuning);

        // Shipped values, tuning.toml's own numbers — not restated as this
        // module's oracle for what they *should* be, only proof the
        // extraction reads the real thing rather than silently defaulting.
        assert!((constants.coverage_decay - 0.75).abs() < 1e-12);
        assert!((constants.sourced_preference - 2.4).abs() < 1e-12);
        assert_eq!(constants.min_sourced_coverage, 2);
        assert_eq!(constants.backlog_override_due, 40);
    }

    #[test]
    fn affinity_leans_sourced_from_consolidating_upward_on_the_shipped_tuning() {
        let tuning = Tuning::default();
        let constants = AdrConstants::from_tuning(&tuning);

        // ADR-015's amendment, stated as a property: the sourced affinity
        // overtakes composed at Consolidating and stays ahead at Automatic.
        assert!(
            constants.affinity_for(WordState::Consolidating, Pool::Sourced)
                > constants.affinity_for(WordState::Consolidating, Pool::Composed)
        );
        assert!(
            constants.affinity_for(WordState::Automatic, Pool::Sourced)
                > constants.affinity_for(WordState::Automatic, Pool::Composed)
        );
    }

    #[test]
    #[should_panic(expected = "unseen word is never a scored coverage candidate")]
    fn affinity_for_unseen_panics_rather_than_guesses() {
        let tuning = Tuning::default();
        let constants = AdrConstants::from_tuning(&tuning);
        constants.affinity_for(WordState::Unseen, Pool::Composed);
    }
}
