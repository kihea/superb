//! The sourced-share calibration instrument (ADR-015 amendment, 2026-07-25;
//! `docs/build-plan.md`'s "T1 — Engine" note; ADVISORY-005 §2).
//!
//! **What this module is, and is not, for.** Kihea's answer to ASK-002 fixed
//! a *target share* under version control — 60% of passages read, where a
//! good excerpt exists, should be real published writing — and made
//! `sourced_preference` a calibrated output rather than a hand-set constant.
//! This module is the calibration: it searches for the multiplier that hits
//! the target, and — because the ADR-015 amendment already found the real
//! measured share is 1.3% against a 60-excerpt corpus, and BRIEF-015's
//! simulator found a 40-excerpt library is *never* selected at any
//! multiplier — it also answers the question the multiplier alone cannot:
//! how big does the corpus have to be. Neither search ever writes a result
//! back into `tuning.toml`; ADVISORY-005 §2's DEFER is explicit that final
//! calibration waits for the real corpus, and this module's own report says
//! so on every run.
//!
//! **The two searches, and why both.** [`sweep_multiplier`] holds the
//! corpus fixed — sized to what track T3 has actually landed
//! (`content/sources/`'s 60 excerpts, `content/passages/`'s 40 composed
//! passages) — and sweeps `sourced_preference` across a wide geometric
//! range, to answer "is a bigger multiplier the fix." The affinity table and
//! the coverage floor are corpus-independent per session; a sourced
//! candidate either clears `min_sourced_coverage` for the current due list
//! or it does not, and `sourced_preference` only decides who wins *among
//! candidates that already cleared it* — so the share should saturate well
//! short of any target, and the report's own numbers are the evidence for
//! that claim rather than an assertion of it. [`sweep_corpus_size`] then
//! holds the multiplier fixed, generously large, and sweeps the sourced
//! library's size instead, to answer the question the amendment already
//! named as the real one: what size corpus would actually reach 60%. Track
//! T3 sizes its corpus work against that number.
//!
//! **Why this reads `content/sources/` and `content/passages/` counts
//! instead of restating them.** A hand-copied "60" and "40" here would drift
//! the day T3 lands more excerpts, silently understating or overstating the
//! live-corpus run without anyone noticing — the same failure
//! `src/tuning_extract.rs`'s own doc comment names for a hand-copied tuning
//! constant. [`live_corpus_counts`] counts the files instead.

use std::fs;
use std::path::Path;

use superb_core::Tuning;

use crate::simulation::{SimConfig, run_with_tuning};

/// The shipped `tuning.toml`, read the same way `superb_core::tuning`'s own
/// `SHIPPED_TUNING_TOML` is — `include_str!`, not a runtime file read, so
/// this crate's own purity-adjacent claim (deterministic, byte-for-byte from
/// its inputs) still holds. Duplicated rather than exposed as a `pub const`
/// on `superb_core::tuning::Tuning`: engine-contract §1 law 6 is exactly
/// about not giving external code a way to build an unvalidated `Tuning`,
/// and reading the same text a second time to build a *different* full
/// string, still validated through [`Tuning::from_toml_str`], adds no such
/// way.
const SHIPPED_TUNING_TOML: &str = include_str!("../../superb-core/tuning.toml");

/// A `Tuning` identical to the shipped one except `sourced_preference`,
/// still fully validated by [`Tuning::from_toml_str`] — never a hand-built
/// struct literal, which would need this crate to duplicate every other
/// field's shipped value and would drift the day one of them changes.
///
/// Panics on a `value` [`Tuning::validate`] rejects (for instance, one that
/// breaks the signal-strength ordering `probe_frequency_cap` neighbours) —
/// a calibration run that silently skipped an invalid point in its own sweep
/// would misreport the sweep's shape, so this fails loudly instead, exactly
/// like every other `Tuning::from_toml_str` call site in this crate.
fn tuning_with_sourced_preference(value: f64) -> Tuning {
    let line = format!("sourced_preference = {value}\n");
    let replaced = replace_toml_line(SHIPPED_TUNING_TOML, "sourced_preference", &line);
    Tuning::from_toml_str(&replaced)
        .unwrap_or_else(|e| panic!("sourced_preference = {value} produced an invalid Tuning: {e}"))
}

/// Replace the one line in `toml` whose key is `key` with `replacement`,
/// verbatim text substitution rather than a TOML-editing dependency this
/// crate would otherwise have no use for — `tuning.toml` is simple enough
/// (one value per line, no inline tables on the lines this module touches)
/// that a line match is exact and unambiguous. Panics if the key is not
/// found or found more than once: a silent no-op here would report a sweep
/// point that never actually varied.
fn replace_toml_line(toml: &str, key: &str, replacement: &str) -> String {
    let prefix = format!("{key} = ");
    let matches: Vec<&str> = toml
        .lines()
        .filter(|line| line.starts_with(&prefix))
        .collect();
    assert_eq!(
        matches.len(),
        1,
        "expected exactly one `{key} = ...` line in tuning.toml, found {}",
        matches.len()
    );
    let mut replaced_once = false;
    let lines: Vec<String> = toml
        .lines()
        .map(|line| {
            if line.starts_with(&prefix) && !replaced_once {
                replaced_once = true;
                replacement.trim_end().to_string()
            } else {
                line.to_string()
            }
        })
        .collect();
    format!("{}\n", lines.join("\n"))
}

/// How many composed passages and sourced excerpts track T3 has actually
/// landed, counted from the files rather than restated — see this module's
/// own doc comment. `sources_dir`/`passages_dir` take a path so a test can
/// point this at a fixture instead of the real content tree.
///
/// Counts every `.json` file except `_seed.py` and any file whose name does
/// not start with `comp-`/`src-` — the convention every file in both
/// directories already follows (`content/passages/README.md`,
/// `content/sources/_seed.py`).
pub fn live_corpus_counts(passages_dir: &Path, sources_dir: &Path) -> LiveCorpusCounts {
    LiveCorpusCounts {
        composed: count_prefixed(passages_dir, "comp-"),
        sourced: count_prefixed(sources_dir, "src-"),
    }
}

fn count_prefixed(dir: &Path, prefix: &str) -> usize {
    fs::read_dir(dir)
        .unwrap_or_else(|e| panic!("read_dir({}): {e}", dir.display()))
        .map(|entry| entry.expect("dir entry is readable").file_name())
        .filter(|name| {
            let name = name.to_string_lossy();
            name.starts_with(prefix) && name.ends_with(".json")
        })
        .count()
}

/// [`live_corpus_counts`]'s answer.
#[derive(Debug, Clone, Copy)]
pub struct LiveCorpusCounts {
    pub composed: usize,
    pub sourced: usize,
}

/// One point on a sweep: the input varied, and the sourced share it
/// produced, aggregated across every seed in the sweep.
#[derive(Debug, Clone, Copy)]
pub struct SweepPoint<T> {
    pub input: T,
    /// `sourced_sessions / (sourced_sessions + composed_sessions)` — idle
    /// sessions excluded from the denominator, the same convention
    /// `report.rs`'s Assertion 5 uses, because an idle session was never a
    /// choice between the two pools.
    pub sourced_share: f64,
    pub sourced_sessions: usize,
    pub composed_sessions: usize,
}

/// Run `config` at every `seed`, aggregate the pool tallies, and compute the
/// sourced share. The one measurement both sweeps below are built from.
fn measure_share(seeds: &[u64], config: &SimConfig, tuning: &Tuning) -> (f64, usize, usize) {
    let mut sourced = 0usize;
    let mut composed = 0usize;
    for &seed in seeds {
        let outcome = run_with_tuning(seed, 0.0, config, tuning);
        sourced += outcome.pools.sourced_sessions;
        composed += outcome.pools.composed_sessions;
    }
    let total = sourced + composed;
    let share = if total == 0 {
        0.0
    } else {
        sourced as f64 / total as f64
    };
    (share, sourced, composed)
}

/// Hold the corpus fixed at `config`'s own library sizes, sweep
/// `sourced_preference` across `multipliers`, and report the share each one
/// produces — this module's own doc comment explains why the share is
/// expected to saturate rather than climb without bound.
pub fn sweep_multiplier(
    seeds: &[u64],
    config: &SimConfig,
    multipliers: &[f64],
) -> Vec<SweepPoint<f64>> {
    multipliers
        .iter()
        .map(|&multiplier| {
            let tuning = tuning_with_sourced_preference(multiplier);
            let (sourced_share, sourced_sessions, composed_sessions) =
                measure_share(seeds, config, &tuning);
            SweepPoint {
                input: multiplier,
                sourced_share,
                sourced_sessions,
                composed_sessions,
            }
        })
        .collect()
}

/// Hold `sourced_preference` fixed at `multiplier` (a caller-chosen value
/// past the point [`sweep_multiplier`] shows the share saturating — the
/// point of this sweep is corpus size, not the multiplier), sweep the
/// sourced library's size across `sizes`, and report the share each one
/// produces.
pub fn sweep_corpus_size(
    seeds: &[u64],
    base_config: &SimConfig,
    multiplier: f64,
    sizes: &[usize],
) -> Vec<SweepPoint<usize>> {
    let tuning = tuning_with_sourced_preference(multiplier);
    sizes
        .iter()
        .map(|&size| {
            let config = SimConfig {
                sourced_library_size: size,
                ..*base_config
            };
            let (sourced_share, sourced_sessions, composed_sessions) =
                measure_share(seeds, &config, &tuning);
            SweepPoint {
                input: size,
                sourced_share,
                sourced_sessions,
                composed_sessions,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tuning_with_sourced_preference_changes_only_that_field() {
        let shipped = Tuning::default();
        let varied = tuning_with_sourced_preference(9.5);

        let constants = crate::tuning_extract::AdrConstants::from_tuning(&varied);
        assert!((constants.sourced_preference - 9.5).abs() < 1e-9);
        // Every other field round-trips unchanged: two `Tuning`s built from
        // texts that differ in exactly one line, both fully validated,
        // agree everywhere else — a spot check on one other field is enough
        // to catch a replacement that clobbered the wrong line.
        assert_eq!(shipped.theta_min(), varied.theta_min());
    }

    #[test]
    #[should_panic(expected = "found 0")]
    fn replace_toml_line_panics_on_a_missing_key() {
        replace_toml_line("a = 1\n", "b", "b = 2\n");
    }

    #[test]
    fn live_corpus_counts_reads_the_fixture_directories() {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/calibration");
        let counts = live_corpus_counts(&fixture.join("passages"), &fixture.join("sources"));
        assert_eq!(counts.composed, 2);
        assert_eq!(counts.sourced, 3);
    }

    #[test]
    fn sweep_multiplier_reports_one_point_per_input() {
        let config = SimConfig {
            sessions: 20,
            composed_library_size: 5,
            sourced_library_size: 5,
            ..SimConfig::default()
        };
        let points = sweep_multiplier(&[1, 2], &config, &[1.0, 4.0, 16.0]);
        assert_eq!(points.len(), 3);
        for point in &points {
            assert!((0.0..=1.0).contains(&point.sourced_share));
        }
    }

    #[test]
    fn sweep_corpus_size_reports_one_point_per_size() {
        let config = SimConfig {
            sessions: 20,
            ..SimConfig::default()
        };
        let points = sweep_corpus_size(&[1, 2], &config, 50.0, &[10, 50]);
        assert_eq!(points.len(), 2);
        for point in &points {
            assert!((0.0..=1.0).contains(&point.sourced_share));
        }
    }
}
