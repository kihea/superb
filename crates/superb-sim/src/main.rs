//! Runs the simulator against its fixed seeds, prints the report, and
//! writes it to `crates/superb-sim/REPORT.md` — this crate's own impurity
//! (engine-contract §1's laws bind `superb-core`, not its host), kept to
//! exactly this one file write.

use std::fs;
use std::path::Path;

use superb_sim::report::FullReport;
use superb_sim::simulation::SimConfig;
use superb_sim::{FIXED_SEEDS, THETA_SWEEP};

fn main() {
    let report = FullReport::build(&FIXED_SEEDS, &THETA_SWEEP, SimConfig::default());
    let markdown = report.to_markdown();

    print!("{markdown}");

    let out_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("REPORT.md");
    fs::write(&out_path, &markdown)
        .unwrap_or_else(|e| panic!("failed to write {}: {e}", out_path.display()));
    eprintln!("\nwrote {}", out_path.display());
}
