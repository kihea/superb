//! Runs the θ̂-coverage instrument (`src/coverage.rs`) — ADVISORY-005 §1
//! item 1's discharge, and item 2's for free — prints the report, and
//! writes it to `crates/superb-sim/COVERAGE.md`. Same one-file-write
//! discipline `main.rs` follows for `REPORT.md`.
//!
//! **This does not touch `REPORT.md`, `FIXED_SEEDS`, or `THETA_SWEEP`.**
//! Those stay pinned exactly as `tests/assertions.rs` and the committed
//! report read them. This is a second, wider instrument answering the
//! question the first one's own 3-seed sample said it could not.
//!
//! The markdown itself is built by `coverage::to_markdown`, not here —
//! `tests/coverage_gate.rs` calls the same function and diffs its output
//! against the file this binary writes, so the two can't drift apart.

use std::fs;
use std::path::Path;

use superb_sim::THETA_SWEEP;
use superb_sim::coverage;

fn main() {
    let markdown = coverage::to_markdown(&THETA_SWEEP);
    print!("{markdown}");

    let out_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("COVERAGE.md");
    fs::write(&out_path, &markdown)
        .unwrap_or_else(|e| panic!("failed to write {}: {e}", out_path.display()));
    eprintln!("\nwrote {}", out_path.display());
}
