//! Runs the pseudoword-penalty calibration sweep
//! (`src/pseudoword_penalty_calibration.rs`, BRIEF-017), prints the report,
//! and writes it to `crates/superb-sim/PSEUDOWORD-PENALTY.md` — the same
//! one-file-write discipline `bin/coverage.rs` follows for `COVERAGE.md`.
//!
//! **This does not touch `tuning.toml`.** The sweep only reads
//! `Tuning::default()`'s bounds (`theta_min`, `theta_max`); every candidate
//! penalty is applied on top of an already-run session's own output, never
//! fed back into the engine. Landing a number from this report is a
//! separate PR, decided by the architect.

use std::fs;
use std::path::Path;

use superb_sim::pseudoword_penalty_calibration::{generate, to_markdown};

fn main() {
    let calibration = generate();
    let markdown = to_markdown(&calibration);
    print!("{markdown}");

    let out_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("PSEUDOWORD-PENALTY.md");
    fs::write(&out_path, &markdown)
        .unwrap_or_else(|e| panic!("failed to write {}: {e}", out_path.display()));
    eprintln!("\nwrote {}", out_path.display());
}
