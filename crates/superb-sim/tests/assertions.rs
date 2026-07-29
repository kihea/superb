//! Engine-contract §5's five simulator assertions, as tests that fail
//! loudly — "not a report a human reads" (BRIEF-014's own Done clause).
//!
//! **What each test gates on, and why.** Two different things are true
//! about a number this file produces: whether the *mechanism* works (θ
//! moves toward truth rather than away from it; the due list drains rather
//! than growing without bound; the pseudoword correction has the right
//! sign; a word can actually reach `AUTOMATIC`), and whether the specific
//! constants in `tuning.toml` land the *number* in the range the engine
//! contract's prose names (θ̂ within its exact SE; 8–12 encounters; a
//! specific due-list ceiling). The brief is explicit that the second kind is
//! *evidence to report*, not a bug to fix by editing a constant — "if the
//! mode is 7 or 13... report it rather than tune until it passes." A test
//! that hard-gates CI on the second kind would force exactly that: a
//! genuine tuning finding would turn into pressure to edit `tuning.toml`
//! just to keep the build green, which is the outcome this whole brief
//! exists to prevent. So every test below asserts the first kind —
//! mechanism-level, and real: each one can and does fail on a defect. The
//! second kind is computed identically (same functions, same fixed seeds)
//! and printed to `REPORT.md` and this reply, for a human to read and argue
//! with.

use superb_sim::report::{Assertion1, Assertion2, Assertion3, Assertion4, Assertion5};
use superb_sim::simulation::{self, SimConfig};
use superb_sim::{FIXED_SEEDS, THETA_SWEEP};

/// Assertion 1. The mechanism claim this test gates CI on: θ̂ moves toward
/// the truth, not away from it, stays finite and in range, and its
/// reported SE never goes negative.
///
/// **What this test deliberately does not gate on, and the finding that
/// forced that choice.** `docs/engine-contract.md` §5 asks for θ̂ to land
/// *within its own reported standard error*. Round 1 found `theta_se` was
/// not a standard error at all — a stored number decayed by a fixed factor
/// on every observation regardless of how informative it was, reporting
/// `~0.000058` after sixty sessions, a certainty no sequence of Bernoulli
/// observations could justify, and the reason 0 of 15 runs landed within
/// it. Round 2 (`ability::update_theta`'s own doc comment) derived
/// `theta_se` on every read from accumulated Fisher information instead —
/// `1 / sqrt(total information)` — but left θ moving by a fixed-size step
/// (`theta_update_rate` times the residual): an estimate and its reported
/// uncertainty from two different mechanisms, and only 3 of 15 runs landed
/// within SE. Round 3 moves θ by Fisher scoring instead — the same residual
/// divided by the same accumulated information `theta_se` is derived from,
/// so both come from one calculation. `theta_update_rate` bought nothing
/// this scheme still needs and is retired from `tuning.toml`. Run for real
/// (`REPORT.md`, this crate's fixed seeds): **6 of 15 runs now land within
/// SE** (up from 3 of 15), mean absolute error fell from `1.0448` to
/// `0.5541`. It is not 15 of 15. Per the brief, three rounds is enough for
/// one brief, and the remaining gap is **unexplained, not diagnosed**: misses
/// occur at every θ in the sweep (θ=-1.5 misses at the same rate as θ=-3.5),
/// and the three θ=3.5 runs — which carry the two largest errors in the
/// table — land at θ̂ = 1.9333, 3.1047, 2.4647, well inside the ±4.0 clamp,
/// so the clamp cannot be biasing them. The candidates that remain and
/// cannot yet be told apart: the response model's own sampling noise, the
/// 60-session horizon, and the Cramér-Rao bound the derived SE reads being a
/// lower bound on variance rather than a prediction of any single run's
/// realised error. See `REPORT.md` for which measurement would separate
/// them; not chased with a fourth round here.
#[test]
fn theta_hat_moves_toward_true_theta_across_the_sweep() {
    let config = SimConfig::default();
    let assertion = Assertion1::run(&FIXED_SEEDS, &THETA_SWEEP, &config);

    assert!(!assertion.runs.is_empty());
    for run in &assertion.runs {
        assert!(
            run.final_theta.is_finite(),
            "seed {} theta {} true {}",
            run.seed,
            run.final_theta,
            run.true_theta
        );
        assert!(run.final_se >= 0.0, "standard error must never be negative");
    }

    // Directional convergence: a learner who never answers is not what is
    // being simulated (`calibration_real_rate` and `overclaim_rate` are both
    // small and nonzero in the default config), so the mean absolute error
    // across the whole sweep must be meaningfully smaller than doing
    // nothing at all — theta starting at 0.0 and never moving would produce
    // a mean absolute error equal to the mean |true_theta| in the sweep.
    let no_update_baseline =
        THETA_SWEEP.iter().map(|t| t.abs()).sum::<f64>() / THETA_SWEEP.len() as f64;
    assert!(
        assertion.mean_abs_error() < no_update_baseline,
        "mean abs error {} should be below the no-update baseline {no_update_baseline} — \
         theta should move toward the truth, not sit at its start",
        assertion.mean_abs_error()
    );
}

/// Assertion 2. The mechanism claim: words actually reach `AUTOMATIC`, and
/// every recorded encounter count is a small positive number consistent
/// with the shipped `consolidating_threshold`/`encounter_target` pair (never
/// zero, never absurdly large). Whether the mode sits at 8–12 specifically
/// is reported, not gated — see this file's own doc comment.
#[test]
fn words_reach_automatic_in_a_small_positive_number_of_varied_context_encounters() {
    let config = SimConfig::default();
    let assertion = Assertion2::run(&FIXED_SEEDS, 0.0, &config);

    assert!(
        !assertion.encounters.is_empty(),
        "expected at least one word to reach AUTOMATIC across {} sessions",
        config.sessions
    );
    for &encounters in &assertion.encounters {
        assert!(
            encounters >= 1,
            "an AUTOMATIC word must have been met at least once"
        );
        assert!(
            encounters <= config.sessions,
            "{encounters} encounters exceeds the {} sessions the run had available",
            config.sessions
        );
    }
    assert!(assertion.mode().is_some());
}

/// Assertion 3. The due list stays bounded to a fraction of vocabulary,
/// across every seed in the fixed sweep.
///
/// **Where the bound sits, and why it is not `reading_vocabulary_size`
/// itself.** PR-21's review (ADVISORY-015's third addendum) found the old
/// bound — `max_due < reading_vocabulary_size` — holds by construction,
/// since the due list is drawn from a subset of the reading vocabulary, and
/// measured that disabling ADR-015's backlog override (`backlog_override_due`
/// 100000, `backlog_override_age_days` 3650) moves the peak from 60 of 240 to
/// 84 of 240 without coming close to failing it. Re-measured here across the
/// same three fixed seeds: shipped tuning peaks at {50, 59, 60} of 240 (max
/// 60, 25% of vocabulary); with the override disabled it peaks at {80, 84,
/// 80} (min 80, 33%). The two populations do not overlap, so the bound is set
/// at 30% of vocabulary — `reading_vocabulary_size * 3 / 10`, 72 of 240 —
/// which leaves shipped tuning 12 words of headroom and the disabled override
/// 8 words over. (Second-half peaks equal full-run peaks in every seed here,
/// so a non-growth condition over the run's back half would not separate the
/// two tunings; only a fraction-of-vocabulary bound does.)
#[test]
fn the_due_list_stays_bounded_across_sixty_sessions() {
    let config = SimConfig::default();
    let outcomes: Vec<_> = FIXED_SEEDS
        .iter()
        .map(|&seed| simulation::run(seed, 0.0, &config))
        .collect();
    let assertion = Assertion3::from_outcomes(&outcomes, config.reading_vocabulary_size);
    let bound = config.reading_vocabulary_size * 3 / 10;

    for run in &assertion.per_run {
        assert!(
            run.max_due < bound,
            "seed {}: due list reached {} of {} words (bound {bound}, 30% of vocabulary) — \
             did not stay bounded",
            run.seed,
            run.max_due,
            config.reading_vocabulary_size
        );
    }
}

/// Assertion 4. The overclaiming learner's θ ends strictly below the honest
/// learner's, same real vocabulary, same real-word evidence, every seed and
/// every true θ in the fixed sweep.
#[test]
fn the_overclaiming_learner_ends_strictly_below_the_honest_learner_everywhere_in_the_sweep() {
    let config = SimConfig::default();
    let assertion = Assertion4::run(&FIXED_SEEDS, &THETA_SWEEP, &config);

    for run in &assertion.runs {
        assert!(
            run.overclaimer_final_theta < run.honest_final_theta,
            "seed {} true_theta {}: overclaimer {} was not strictly below honest {}",
            run.seed,
            run.true_theta,
            run.overclaimer_final_theta,
            run.honest_final_theta
        );
    }
}

/// Assertion 5 — the falsifier ADVISORY-001 named. The due list stays
/// bounded with ADR-015's sourced preference active, and the sourced pool
/// was genuinely chosen at least once — proving the preference was actually
/// exercised, not merely configured and left idle. Per the brief: if this
/// fails, that reopens ASK-002 and is not a tuning problem — this test is
/// written to fail exactly that loudly, on both halves of the claim.
#[test]
fn the_due_list_stays_bounded_with_the_sourced_preference_active() {
    let config = SimConfig::default();
    let outcomes: Vec<_> = FIXED_SEEDS
        .iter()
        .map(|&seed| simulation::run(seed, 0.0, &config))
        .collect();
    let assertion = Assertion5::from_outcomes(&outcomes, config.reading_vocabulary_size);

    assert!(
        assertion.sourced_preference_was_exercised(),
        "the sourced pool was never chosen across {} seeds — the sourced preference was \
         configured but never exercised, so this assertion tests nothing",
        FIXED_SEEDS.len()
    );
    assert!(
        assertion.bounded,
        "due list reached {} of {} words with the sourced preference active — did not stay \
         bounded. This is ADVISORY-001's falsifier: say so and stop, this is not a tuning \
         problem.",
        assertion.max_due, config.reading_vocabulary_size
    );
}
