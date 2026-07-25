//! `tests/golden/*.jsonl`: engine-contract §5's golden vectors, run for
//! real.
//!
//! Each fixture is a session in miniature: a header line naming the
//! learner's starting state, the moment (`now`), the one event the host
//! reported, and the frame the host fetched for it — followed by one line
//! per effect that event must produce, in order. This test reconstructs the
//! whole file from the fixture's own inputs, by actually calling
//! [`superb_core::engine::decide`], and asserts the result is byte-identical
//! to what is committed.
//!
//! **A failing assertion here means the engine's behaviour changed.** The
//! panic message below says exactly that, and stops there on purpose — see
//! its own comment.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use superb_core::engine::{self, Frame, Request};
use superb_core::signals::Event;
use superb_core::{LearnerState, Timestamp, Tuning};

/// The fixture's first line: everything `decide` needs to reproduce the
/// rest of the file. Deliberately the same shape whichever direction it is
/// used in — read back from a committed fixture, or written fresh by
/// whoever adds one — so there is exactly one way this crate spells it.
#[derive(Debug, Serialize, Deserialize)]
struct Header {
    initial_state: LearnerState,
    now: u64,
    event: Event,
    frame: Frame,
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

    let mut learner = header.initial_state;
    let now = Timestamp::from_millis_since_epoch(header.now);
    let tuning = Tuning::default();
    let request = Request::ProcessEvent(header.event);

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
