//! `tests/golden/*.jsonl`: engine-contract §5's golden vectors, run for
//! real.
//!
//! Each fixture is a session in miniature: a header line naming the
//! learner's starting state, the moment (`now`), the request the host made,
//! and the frame the host fetched for it — followed by one line per effect
//! that request must produce, in order. This test reconstructs the whole
//! file from the fixture's own inputs, by actually calling
//! [`superb_core::engine::decide`], and asserts the result is byte-identical
//! to what is committed.
//!
//! **A failing assertion here means the engine's behaviour changed.** The
//! panic message below says exactly that, and stops there on purpose — see
//! its own comment.
//!
//! **ADR-030: the header carries a request, and `ProcessEvent` is the
//! default spelling of one, not the only one.** Every vector committed
//! before this ADR names its request with `event` alone — that is
//! `ProcessEvent(event)`, and it stays exactly that: `request` is absent,
//! `event` is present, nothing about an existing fixture's bytes changes.
//! A `NextPassage` vector is the other shape: `request` names the variant
//! and `event` is absent, because `Request::NextPassage` carries no event to
//! carry. Exactly one of the two must be present — an ambiguous or empty
//! header is a fixture-authoring mistake and fails loudly at parse time
//! (`Header::header_request`'s own panic messages) rather than silently
//! picking a default. This is chosen over a `request: Request` field
//! carrying the whole shape because `Request::ProcessEvent(Event)` is not
//! itself `Deserialize` from a bare event object — modelling it as two
//! optional sibling fields is what lets every already-committed header stay
//! byte-for-byte unchanged (ADR-030 Decision 1, "one format, one harness").
//!
//! **The `NextPassage` fixture's frame carries two candidates the composer
//! must actually choose between** — a composed template and a sourced
//! excerpt that can both serve the one due word — rather than one candidate
//! with nothing to be scored against. ADR-030's own "Costs" section named
//! the risk this closes: "a frame with two candidates that scoring never has
//! to choose between pins very little, and nothing mechanical catches that."
//! With one candidate, no tuning constant that governs the choice between
//! pools (`min_sourced_coverage`, `sourced_preference`, the affinity table)
//! can be observed to change this fixture's outcome, so a red-before-trusted
//! check against `tuning.toml` would have nothing to bite. Lowering
//! `min_sourced_coverage` from 2 to 1 makes the sourced candidate eligible
//! and it outscores the composed one outright — the vector fails, restoring
//! the constant makes it pass again — which is the demonstration this file's
//! own doc comment above asks whoever adds a fixture to actually run.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use superb_core::engine::{self, Frame, Request};
use superb_core::signals::Event;
use superb_core::{LearnerState, Timestamp, Tuning};

/// The two ways a header can name `Request::NextPassage` (the only variant
/// besides `ProcessEvent`, which the header's `event` field already spells).
/// `SCREAMING_SNAKE_CASE` to match every other wire tag this crate writes —
/// see `state.rs` and `signals.rs`'s own `rename_all`.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum RequestKind {
    NextPassage,
}

/// The fixture's first line: everything `decide` needs to reproduce the
/// rest of the file. Deliberately the same shape whichever direction it is
/// used in — read back from a committed fixture, or written fresh by
/// whoever adds one — so there is exactly one way this crate spells it.
#[derive(Debug, Serialize, Deserialize)]
struct Header {
    initial_state: LearnerState,
    now: u64,
    /// Present only for a request other than `ProcessEvent` — today, only
    /// `NextPassage`. Absent on every vector committed before ADR-030.
    #[serde(default)]
    request: Option<RequestKind>,
    /// Present only for `ProcessEvent` — absent exactly when `request` is
    /// present, and vice versa; see `Header::header_request`.
    #[serde(default)]
    event: Option<Event>,
    frame: Frame,
}

impl Header {
    /// The one `Request` this header actually names, and the loud failure
    /// for the two shapes that are not that: both fields present (which one
    /// wins?) and neither (wins nothing). See this module's own doc comment
    /// for why the header carries two optional siblings instead of one
    /// `Request`-shaped field.
    fn header_request(&self, header_line: &str) -> Request {
        match (&self.request, &self.event) {
            (Some(RequestKind::NextPassage), None) => Request::NextPassage,
            (None, Some(event)) => Request::ProcessEvent(event.clone()),
            (Some(_), Some(_)) => panic!(
                "fixture header names both request and event — exactly one must be present:\n\
                 {header_line}"
            ),
            (None, None) => panic!(
                "fixture header names neither request nor event — exactly one must be present:\n\
                 {header_line}"
            ),
        }
    }
}

/// Every `.jsonl` file directly under `tests/golden/`, sorted so a failure
/// is reported in a stable order across runs.
fn golden_vector_paths() -> Vec<std::path::PathBuf> {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/golden");
    let mut paths: Vec<_> = fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("read_dir({}): {e}", dir.display()))
        .map(|entry| entry.expect("dir entry is readable").path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "jsonl"))
        .collect();
    paths.sort();
    assert!(!paths.is_empty(), "tests/golden/ has no .jsonl vectors");
    paths
}

/// Re-run one fixture's event through the real engine and rebuild the whole
/// file's expected bytes from that result — never from anything already on
/// disk.
fn regenerate(original: &str) -> String {
    let mut lines = original.lines();
    let header_line = lines
        .next()
        .unwrap_or_else(|| panic!("fixture has no header line"));
    let header: Header = serde_json::from_str(header_line)
        .unwrap_or_else(|e| panic!("fixture header does not parse: {e}\n{header_line}"));

    let request = header.header_request(header_line);
    let mut learner = header.initial_state;
    let now = Timestamp::from_millis_since_epoch(header.now);
    let tuning = Tuning::default();

    let outcome = engine::decide(&mut learner, request, header.frame, now, &tuning);

    let mut rebuilt = vec![header_line.to_string()];
    for effect in &outcome.effects {
        rebuilt.push(serde_json::to_string(effect).expect("Effect serializes"));
    }
    format!("{}\n", rebuilt.join("\n"))
}

#[test]
fn every_golden_vector_replays_byte_identically() {
    for path in golden_vector_paths() {
        let original =
            fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
        let rebuilt = regenerate(&original);

        assert_eq!(
            rebuilt,
            original,
            "\n\n{} no longer matches what the engine produces.\n\
             A golden vector is a pinned behaviour, not a snapshot to refresh: this diff is a \
             behaviour change and needs an argument for it in the PR, the same as any other \
             change to what the engine decides.\n",
            path.display()
        );
    }
}
