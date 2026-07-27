//! `superb-wasm`: the wasm-bindgen surface for web (`docs/seams.md` §Seam 1).
//!
//! One exported type, `Engine`, carrying exactly the four methods
//! `EnginePort` names in `docs/seams.md` — `load`, `save`, `plan`, `decide`
//! — and nothing else. No getter for θ, no "what state is this word in", no
//! "when is this due": a shell that could ask those questions could act on
//! the answer, and acting on it is deciding (`docs/architecture.md` §3). The
//! only judgment this crate exercises is the wire translation in
//! `src/wire.rs`.
//!
//! **Purity, kept across the boundary, not just inside `superb-core`.**
//! `now` is a parameter (`nowMs`, converted once in `wire::timestamp_from_ms`)
//! and never read from a clock in Rust; a fresh learner's `seed` and
//! `draw_count` are `0`, not drawn from any source of randomness, because
//! nothing in `superb-core` reads either field yet (`learner.rs`'s own doc
//! comment: "never advanced or reseeded by this crate — only read alongside
//! `draw_count` to reproduce a draw"). The day something does, the seed has
//! to come from the host, the same way `nowMs` already does — this crate
//! must not reach for `js_sys::Math::random` to manufacture one, because
//! that would put an RNG behind a `superb-core` boundary law forbids one on
//! the other side of.
//!
//! **No panic reaches the JS boundary.** Every fallible step — parsing a
//! `document`, decoding a `Request`/`Frame` off the wire — returns a
//! `Result`, propagated with `?` into a `Result<_, JsValue>` wasm-bindgen
//! turns into a thrown `Error`. A malformed call is the host's bug to fix,
//! not this module's panic to poison the whole wasm instance over.

mod wire;

use wasm_bindgen::prelude::*;

use superb_core::engine as core_engine;
use superb_core::{LearnerState, Tuning};

use wire::{WireEffect, WireFrame, WireNeeds, WireRequest, timestamp_from_ms};

/// `docs/seams.md`'s `EnginePort`, minus the `load`/`save`/`plan`/`decide`
/// signatures wasm-bindgen cannot express as anything richer than `JsValue`
/// — see `port.d.ts`, which is what a TypeScript caller actually reads.
#[wasm_bindgen]
pub struct Engine {
    learner: LearnerState,
    // Loaded once per instance from `tuning.toml` (`Tuning::default()`,
    // `superb-core`'s own compile-time `include_str!` — no runtime file
    // read). Not host-configurable: `docs/seams.md` names no tuning
    // parameter, because every tunable constant is a shipped decision, not
    // one this crate's caller gets to make (CLAUDE.md's spine).
    tuning: Tuning,
}

/// A learner with no history: `seed` and `draw_count` at `0` (see this
/// module's doc comment), θ at the logit scale's neutral point, and
/// `theta_information` at the tuning's own prior — the same construction
/// `superb-sim`'s `fresh_learner` uses, so a fresh web session and a fresh
/// simulated one start from the same place.
fn fresh_learner(tuning: &Tuning) -> LearnerState {
    LearnerState::new(
        0,
        0,
        0.0,
        tuning.theta_prior_information(),
        Default::default(),
        Default::default(),
    )
}

/// `document` into a `JsValue` error a caller can read, rather than
/// `superb-core`'s own `Display` swallowed into an opaque one.
fn load_error_to_js(error: superb_core::LoadError) -> JsValue {
    JsValue::from_str(&format!("superb-wasm: load failed: {error}"))
}

#[wasm_bindgen]
impl Engine {
    /// A fresh engine, equivalent to calling `load(null)` immediately after
    /// construction. Not part of `EnginePort` itself — every `wasm-bindgen`
    /// class needs a constructor JS can call `new` on — but it adds no
    /// question a shell could ask and act on, so it does not widen the
    /// boundary `docs/architecture.md` §3 draws.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Engine {
        let tuning = Tuning::default();
        let learner = fresh_learner(&tuning);
        Engine { learner, tuning }
    }

    /// `EnginePort.load`: replace this instance's whole learner history with
    /// `document`, or with a fresh one if `document` is `null`/`undefined`.
    /// A malformed document is a thrown `Error`, never a panic.
    pub fn load(&mut self, document: Option<String>) -> Result<(), JsValue> {
        self.learner = match document {
            None => fresh_learner(&self.tuning),
            Some(document) => LearnerState::load(&document).map_err(load_error_to_js)?,
        };
        Ok(())
    }

    /// `EnginePort.save`: this instance's whole learner history, as the
    /// versioned envelope `LearnerState::to_document` writes. The shell
    /// persists the bytes and never reads inside them.
    pub fn save(&self) -> String {
        self.learner.to_document()
    }

    /// `EnginePort.plan`: what the host must fetch before `decide` can act on
    /// `request`. Pure and read-only — this call never mutates the learner.
    pub fn plan(&self, request: JsValue, now_ms: f64) -> Result<JsValue, JsValue> {
        let wire_request: WireRequest = serde_wasm_bindgen::from_value(request)?;
        let request: core_engine::Request = wire_request.into();
        let now = timestamp_from_ms(now_ms);

        let needs = core_engine::plan(&self.learner, &request, now, &self.tuning);

        let wire_needs = WireNeeds::from(needs);
        Ok(serde_wasm_bindgen::to_value(&wire_needs)?)
    }

    /// `EnginePort.decide`: turn `request` and the `frame` the host fetched
    /// in answer to `plan` into the ordered effect stream, mutating this
    /// instance's learner exactly as `superb_core::engine::decide` does.
    pub fn decide(
        &mut self,
        request: JsValue,
        frame: JsValue,
        now_ms: f64,
    ) -> Result<JsValue, JsValue> {
        let wire_request: WireRequest = serde_wasm_bindgen::from_value(request)?;
        let wire_frame: WireFrame = serde_wasm_bindgen::from_value(frame)?;
        let request: core_engine::Request = wire_request.into();
        let frame: core_engine::Frame = wire_frame.into();
        let now = timestamp_from_ms(now_ms);

        let outcome = core_engine::decide(&mut self.learner, request, frame, now, &self.tuning);

        let wire_effects: Vec<WireEffect> = outcome.effects.into_iter().map(Into::into).collect();
        Ok(serde_wasm_bindgen::to_value(&wire_effects)?)
    }
}

impl Default for Engine {
    fn default() -> Self {
        Engine::new()
    }
}

#[cfg(test)]
mod tests {
    //! Plain Rust tests (native target, no wasm needed) for the two things
    //! this module adds beyond `wire.rs`'s translation: a fresh learner's
    //! shape, and that `load`/`save` round-trip. The wasm-boundary behaviour
    //! itself — a real `JsValue` in, a real one out — is `tests/golden.mjs`'s
    //! job, run against the actual compiled artifact from Node.

    use super::*;

    #[test]
    fn a_fresh_learner_has_no_history_and_the_tuning_s_prior_information() {
        let tuning = Tuning::default();
        let learner = fresh_learner(&tuning);
        assert_eq!(learner.seed, 0);
        assert_eq!(learner.draw_count, 0);
        assert_eq!(learner.theta(&tuning), 0.0);
        assert_eq!(
            learner.theta_information(),
            tuning.theta_prior_information()
        );
        assert!(learner.words.is_empty());
        assert!(learner.topic_affinities.is_empty());
    }

    #[test]
    fn save_then_load_reproduces_an_equivalent_learner() {
        let tuning = Tuning::default();
        let learner = fresh_learner(&tuning);
        let document = learner.to_document();

        let reloaded = LearnerState::load(&document).expect("a freshly saved document reloads");
        assert_eq!(reloaded, learner);
    }

    #[test]
    fn load_rejects_a_malformed_document_with_a_typed_error_rather_than_a_panic() {
        // `JsValue` construction (what `load_error_to_js` does with this
        // error) needs the real wasm/JS glue and cannot run under a native
        // `cargo test` binary — `tests/golden.mjs` is what actually drives
        // `Engine::load` with malformed input through the compiled wasm and
        // asserts it throws a catchable `Error` rather than panicking. This
        // test covers the half that is plain Rust: `LearnerState::load`
        // itself returns rather than panics.
        LearnerState::load("not json").expect_err("malformed input is an error");
    }
}
