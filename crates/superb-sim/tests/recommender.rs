//! Assertion 6 — the recommender learns a taste it was never told (ADR-022).
//!
//! The synthetic reader has a hidden liking for each topic
//! (`vocabulary::topic_taste`). The engine never sees it. All it ever receives
//! is a stream of `PassageFinished` and `PassageAbandoned` events, and all it
//! keeps is two counts per topic. The question this file asks is whether that
//! is enough: does the engine's estimate come to resemble a number nothing ever
//! showed it?
//!
//! Read against a *noisy* signal on purpose — `oracle::finishes_passage` maps
//! total indifference to a 15% finish rate and total enthusiasm to 85%, never
//! 0% and 100%. A reader who behaved deterministically would make any estimator
//! look good.

use superb_sim::FIXED_SEEDS;
use superb_sim::simulation::{SimConfig, run};

/// The middle of the sweep rather than all of it. Taste has nothing to do with
/// ability, so the extremes buy no coverage here — only runtime, and a
/// 240-session run is not cheap.
const THETA_SWEEP: [f64; 3] = [-1.5, 0.0, 1.5];

/// Pearson correlation between the engine's learned finish rate per topic and
/// the reader's hidden taste for it, pooled across every run.
fn correlation(pairs: &[(f64, f64)]) -> f64 {
    let n = pairs.len() as f64;
    let mean_x = pairs.iter().map(|(x, _)| x).sum::<f64>() / n;
    let mean_y = pairs.iter().map(|(_, y)| y).sum::<f64>() / n;
    let mut cov = 0.0;
    let mut var_x = 0.0;
    let mut var_y = 0.0;
    for (x, y) in pairs {
        let dx = x - mean_x;
        let dy = y - mean_y;
        cov += dx * dy;
        var_x += dx * dx;
        var_y += dy * dy;
    }
    cov / (var_x.sqrt() * var_y.sqrt())
}

fn pooled_estimates() -> Vec<(f64, f64)> {
    let config = SimConfig::default();
    let mut pairs = Vec::new();
    for &seed in &FIXED_SEEDS {
        for &theta in &THETA_SWEEP {
            for (_, learned, truth) in run(seed, theta, &config).topic_estimates {
                pairs.push((learned, truth));
            }
        }
    }
    pairs
}

/// The claim itself: what the engine believes about a reader's taste tracks
/// what is actually true of them, from behaviour alone.
#[test]
fn the_learned_topic_rate_tracks_the_readers_hidden_taste() {
    let pairs = pooled_estimates();
    assert!(
        pairs.len() >= 40,
        "too few topic estimates to say anything: {}",
        pairs.len()
    );

    let r = correlation(&pairs);
    assert!(
        r > 0.5,
        "learned topic rate correlates with hidden taste at only r = {r:.3} across {} \
         estimates — the recommender is not recovering taste from behaviour",
        pairs.len()
    );
}

/// The recommender must not collapse. A reader who is served one topic forever
/// meets a narrower vocabulary, which is the product failing at its real job
/// while looking like it is working — the failure ADR-022's exploration bonus
/// exists to prevent. Every topic in the corpus should get tried.
#[test]
fn every_topic_is_tried_rather_than_the_first_favourite_winning() {
    let config = SimConfig::default();
    let outcome = run(FIXED_SEEDS[0], 0.0, &config);

    assert_eq!(
        outcome.topic_estimates.len(),
        superb_sim::library::TOPICS.len(),
        "only {} of {} topics were ever tried — the recommender collapsed onto \
         its early favourites instead of exploring",
        outcome.topic_estimates.len(),
        superb_sim::library::TOPICS.len()
    );
}

/// Taste must not cost the reader their schedule. ADR-022 D4 bounds the
/// multiplier and suspends it under backlog precisely so that adding a
/// recommender cannot break the assertion the product cannot survive losing.
#[test]
fn the_due_list_stays_bounded_with_the_recommender_active() {
    let config = SimConfig::default();
    for &seed in &FIXED_SEEDS {
        let outcome = run(seed, 0.0, &config);
        let peak = outcome.due_list_sizes.iter().copied().max().unwrap_or(0);
        assert!(
            peak < config.reading_vocabulary_size,
            "seed {seed}: due list peaked at {peak} of {} with the recommender active",
            config.reading_vocabulary_size
        );
    }
}
