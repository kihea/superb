//! The composer, judged against ADR-015 rather than against itself.
//!
//! BRIEF-014's simulator asserted a composer stand-in that re-derived ADR-015
//! in the same brief that tested it — agreement between a mechanism and its own
//! model, which looks exactly like validation. These tests answer that by
//! taking their expected values from the ADR's own worked table, computed by
//! hand from the shipped constants, so a change to the scoring function has to
//! disagree with a number written down before the code existed.

use std::collections::{BTreeMap, BTreeSet};

use superb_core::composer::{Candidate, ContentFrame, Pool, Slot, compose};
use superb_core::learner::{ContextEncounter, LearnerState, Timestamp, WordRecord};
use superb_core::state::WordState;
use superb_core::tuning::Tuning;

const NOW_MS: u64 = 1_000_000_000;

fn now() -> Timestamp {
    Timestamp::from_millis_since_epoch(NOW_MS)
}

/// A word that is due exactly now, in `state`, met in `frames` before.
fn due_word(state: WordState, frames: Vec<ContextEncounter>) -> WordRecord {
    WordRecord::new(state, now(), frames, Some(1.0))
}

/// `count` due words named `w0..w{count-1}`, all in `state`, none met before.
fn learner_with_due(count: usize, state: WordState) -> LearnerState {
    let mut words = BTreeMap::new();
    for i in 0..count {
        words.insert(format!("w{i}"), due_word(state, Vec::new()));
    }
    LearnerState::new(0, 0, 0.0, 1.0, words, BTreeMap::new())
}

/// Every word in one class, and every slot accepting that class — so slot
/// compatibility never confounds a test about scoring.
fn all_one_class(words: &[&str]) -> BTreeMap<String, BTreeSet<String>> {
    words
        .iter()
        .map(|word| ((*word).to_string(), BTreeSet::from(["noun".to_string()])))
        .collect()
}

fn composed(id: &str, slot_count: u32) -> Candidate {
    Candidate {
        id: id.to_string(),
        pool: Pool::Composed,
        slots: (0..slot_count)
            .map(|index| Slot {
                index,
                class: "noun".to_string(),
                default_word: format!("default{index}"),
            })
            .collect(),
        words: Vec::new(),
    }
}

fn sourced(id: &str, words: &[&str]) -> Candidate {
    Candidate {
        id: id.to_string(),
        pool: Pool::Sourced,
        slots: Vec::new(),
        words: words.iter().map(|word| (*word).to_string()).collect(),
    }
}

/// ADR-015's own worked example, the whole table, in one test.
///
/// "Three sourced due words against six composed ones, computed at d = 0.75,
/// sourced_preference = 2.4":
///
/// | Word state | Composed, 6 words | Sourced, 3 words | Winner |
/// |---|---|---|---|
/// | `Seeded` | 3.29 | 2.77 | composed |
/// | `Learning` | 3.29 | 3.88 | **sourced** |
/// | `Consolidating` | 2.63 | 7.21 | **sourced** |
/// | `Automatic` | 1.64 | 8.32 | **sourced** |
///
/// The fourth row is the one worth naming: the ADR deliberately does *not*
/// honour the "literature wins" answer at `Seeded`, because a word met exactly
/// once is the single case where a context built to teach beats a context
/// found in the wild. A composer that made literature win everywhere would
/// look like it was obeying the taste owner and would be wrong.
#[test]
fn the_adr_015_worked_table_comes_out_exactly_as_written() {
    let tuning = Tuning::default();
    let classes = all_one_class(&["w0", "w1", "w2", "w3", "w4", "w5"]);

    let cases = [
        (WordState::Seeded, Pool::Composed),
        (WordState::Learning, Pool::Sourced),
        (WordState::Consolidating, Pool::Sourced),
        (WordState::Automatic, Pool::Sourced),
    ];

    for (state, expected_pool) in cases {
        let learner = learner_with_due(6, state);
        let frame = ContentFrame {
            candidates: vec![composed("c", 6), sourced("s", &["w0", "w1", "w2"])],
            word_classes: classes.clone(),
            band_words: Vec::new(),
        };

        let passage = compose(&learner, &frame, now(), &tuning)
            .unwrap_or_else(|| panic!("{state:?}: six due words must produce a passage"));

        assert_eq!(
            passage.pool, expected_pool,
            "{state:?}: ADR-015's table says {expected_pool:?} wins, got {:?} ({})",
            passage.pool, passage.id
        );
    }
}

/// The coverage floor, stated by ADR-015 as: "a sourced excerpt is only a
/// candidate if it covers at least `min_sourced_coverage` due words in
/// informative context. Below that it is decoration, and decoration must not
/// displace a scheduled encounter."
///
/// Set up so the preference would otherwise win outright — one `Automatic`
/// word, where sourced affinity is three times composed and the multiplier is
/// on top of that.
#[test]
fn a_sourced_excerpt_below_the_coverage_floor_is_not_a_candidate() {
    let tuning = Tuning::default();
    let learner = learner_with_due(1, WordState::Automatic);
    let frame = ContentFrame {
        candidates: vec![composed("c", 4), sourced("s", &["w0"])],
        word_classes: all_one_class(&["w0"]),
        band_words: Vec::new(),
    };

    let passage = compose(&learner, &frame, now(), &tuning).expect("one due word, one passage");

    assert_eq!(
        passage.pool,
        Pool::Composed,
        "one covered word is below min_sourced_coverage, so sourced is not on the ballot"
    );
}

/// The backlog override, and the reason it exists: it is what makes
/// engine-contract §5's bounded-due-list assertion provable rather than hoped
/// for. Past `backlog_override_due` (40 shipped) waiting words the literature
/// preference is suspended and coverage wins outright.
///
/// Every word is `Automatic` and sourced-eligible — the state where the
/// preference is strongest — so nothing but the guard can produce this result.
#[test]
fn a_backlogged_due_list_suspends_the_literature_preference() {
    let tuning = Tuning::default();
    let learner = learner_with_due(45, WordState::Automatic);
    let names: Vec<String> = (0..45).map(|i| format!("w{i}")).collect();
    let refs: Vec<&str> = names.iter().map(String::as_str).collect();

    let frame = ContentFrame {
        candidates: vec![composed("c", 6), sourced("s", &refs[..3])],
        word_classes: all_one_class(&refs),
        band_words: Vec::new(),
    };

    let passage = compose(&learner, &frame, now(), &tuning).expect("a large due list still reads");

    assert_eq!(
        passage.pool,
        Pool::Composed,
        "45 due words is past backlog_override_due (40): coverage must beat taste"
    );
    assert_eq!(
        passage.targets.len(),
        6,
        "the highest-coverage candidate wins outright under backlog"
    );
}

/// Below the backlog threshold the same shape goes the other way — which is
/// what makes the test above about the guard rather than about coverage
/// happening to win.
#[test]
fn the_same_shape_below_the_backlog_threshold_still_prefers_literature() {
    let tuning = Tuning::default();
    let learner = learner_with_due(6, WordState::Automatic);
    let frame = ContentFrame {
        candidates: vec![composed("c", 6), sourced("s", &["w0", "w1", "w2"])],
        word_classes: all_one_class(&["w0", "w1", "w2", "w3", "w4", "w5"]),
        band_words: Vec::new(),
    };

    let passage = compose(&learner, &frame, now(), &tuning).expect("six due words read");

    assert_eq!(passage.pool, Pool::Sourced);
}

/// engine-contract §4: "no word reuses one of its previous context frames."
///
/// Kept per word, not per candidate: `s` has already served `w0`, so `w0` may
/// not be served by it again — but `w1` and `w2` still can, and the excerpt
/// stays on the ballot. A per-candidate rule would retire a good excerpt from
/// the library forever the first time any one of its words appeared in it.
#[test]
fn a_word_is_never_served_twice_in_the_same_context_frame() {
    let tuning = Tuning::default();
    let mut words = BTreeMap::new();
    words.insert(
        "w0".to_string(),
        due_word(
            WordState::Automatic,
            vec![ContextEncounter {
                frame_id: "s".to_string(),
                clean: true,
            }],
        ),
    );
    for i in 1..4 {
        words.insert(format!("w{i}"), due_word(WordState::Automatic, Vec::new()));
    }
    let learner = LearnerState::new(0, 0, 0.0, 1.0, words, BTreeMap::new());

    let frame = ContentFrame {
        candidates: vec![sourced("s", &["w0", "w1", "w2"])],
        word_classes: all_one_class(&["w0", "w1", "w2", "w3"]),
        band_words: Vec::new(),
    };

    let passage = compose(&learner, &frame, now(), &tuning).expect("two fresh words still qualify");

    assert!(
        !passage.targets.contains(&"w0".to_string()),
        "w0 has already met this excerpt: {:?}",
        passage.targets
    );
    assert_eq!(passage.targets, vec!["w1".to_string(), "w2".to_string()]);
}

/// engine-contract §4: "a real default word in every slot so an unfilled slot
/// is invisible." Two due words into a six-slot template must still produce
/// six fills — four of them defaults — or the reader could count the gaps and
/// know exactly which words the app chose for them, which is law 3 broken by
/// a data shape rather than by copy.
#[test]
fn every_slot_is_filled_so_an_unfilled_slot_is_invisible() {
    let tuning = Tuning::default();
    let learner = learner_with_due(2, WordState::Learning);
    let frame = ContentFrame {
        candidates: vec![composed("c", 6)],
        word_classes: all_one_class(&["w0", "w1"]),
        band_words: Vec::new(),
    };

    let passage = compose(&learner, &frame, now(), &tuning).expect("two due words read");

    assert_eq!(passage.fills.len(), 6, "every slot must carry a word");
    assert_eq!(passage.targets.len(), 2, "only two of them are targets");
    let indices: Vec<u32> = passage.fills.iter().map(|fill| fill.index).collect();
    assert_eq!(
        indices,
        vec![0, 1, 2, 3, 4, 5],
        "fills arrive in render order"
    );
    assert!(
        passage.fills.iter().all(|fill| !fill.word.is_empty()),
        "no slot may render empty: {:?}",
        passage.fills
    );
}

/// A word may only fill a slot its class accepts. `w0` is a verb in a template
/// of noun slots, so it is not served at all — and with nothing else on offer,
/// there is no passage rather than an ungrammatical one.
#[test]
fn a_word_never_fills_a_slot_its_class_does_not_accept() {
    let tuning = Tuning::default();
    let learner = learner_with_due(1, WordState::Learning);
    let frame = ContentFrame {
        candidates: vec![composed("c", 3)],
        word_classes: BTreeMap::from([("w0".to_string(), BTreeSet::from(["verb".to_string()]))]),
        band_words: Vec::new(),
    };

    assert!(
        compose(&learner, &frame, now(), &tuning).is_none(),
        "a template that cannot hold the only due word teaches nothing"
    );
}

/// Nothing due is not an error and not an empty passage — it is no passage.
/// The shell decides what to show instead; the engine declines to invent a
/// reason to read.
#[test]
fn nothing_due_produces_no_passage() {
    let tuning = Tuning::default();
    let learner = LearnerState::new(0, 0, 0.0, 1.0, BTreeMap::new(), BTreeMap::new());
    let frame = ContentFrame {
        candidates: vec![composed("c", 6)],
        word_classes: BTreeMap::new(),
        band_words: Vec::new(),
    };

    assert!(compose(&learner, &frame, now(), &tuning).is_none());
}

/// engine-contract §1: the engine is deterministic. Candidate order is the
/// host's business — a cache returns what it returns — so the same set offered
/// in a different order must produce the same passage, down to the order of
/// the targets.
#[test]
fn candidate_order_never_changes_the_answer() {
    let tuning = Tuning::default();
    let learner = learner_with_due(6, WordState::Consolidating);
    let classes = all_one_class(&["w0", "w1", "w2", "w3", "w4", "w5"]);

    let forward = vec![
        composed("c1", 6),
        composed("c2", 6),
        sourced("s1", &["w0", "w1", "w2"]),
        sourced("s2", &["w3", "w4", "w5"]),
    ];
    let mut reversed = forward.clone();
    reversed.reverse();

    let first = compose(
        &learner,
        &ContentFrame {
            candidates: forward,
            word_classes: classes.clone(),
            band_words: Vec::new(),
        },
        now(),
        &tuning,
    );
    let second = compose(
        &learner,
        &ContentFrame {
            candidates: reversed,
            word_classes: classes,
            band_words: Vec::new(),
        },
        now(),
        &tuning,
    );

    assert_eq!(
        first, second,
        "equal-scoring candidates must break ties stably"
    );
    assert!(first.is_some());
}

/// The whole front door, end to end: `plan` names what the host must fetch,
/// the host answers, `decide` returns the passage as an effect. This is the
/// only test that exercises the shape a real shell will actually use.
#[test]
fn plan_then_decide_returns_a_passage_as_an_effect() {
    use superb_core::engine::{Effect, Frame, Needs, Request, decide, plan};

    let tuning = Tuning::default();
    let mut learner = learner_with_due(3, WordState::Learning);

    let needs = plan(&learner, &Request::NextPassage, now(), &tuning);
    let Needs::PassageCandidates {
        due_words,
        band_low,
        band_high,
    } = needs
    else {
        panic!("NextPassage must ask for candidates, got {needs:?}");
    };
    assert_eq!(due_words, vec!["w0", "w1", "w2"], "due, oldest first");
    assert!(
        band_low < band_high,
        "the band must be an interval: {band_low}..{band_high}"
    );

    let content = ContentFrame {
        candidates: vec![composed("c", 4)],
        word_classes: all_one_class(&["w0", "w1", "w2"]),
        band_words: Vec::new(),
    };
    let outcome = decide(
        &mut learner,
        Request::NextPassage,
        Frame::Content(content),
        now(),
        &tuning,
    );

    match outcome.effects.as_slice() {
        [Effect::PassageComposed { passage }] => {
            assert_eq!(passage.id, "c");
            assert_eq!(passage.targets.len(), 3);
            assert_eq!(passage.fills.len(), 4);
        }
        other => panic!("expected exactly one PassageComposed, got {other:?}"),
    }
}

/// Choosing a passage records nothing. A word's history changes when the
/// reader actually meets the text — `Event::PassageFinished` — not when the
/// composer picks it. Otherwise a passage offered and never read would burn
/// the reader's one chance to meet that word in that context.
#[test]
fn choosing_a_passage_does_not_touch_the_learner() {
    use superb_core::engine::{Frame, Request, decide};

    let tuning = Tuning::default();
    let mut learner = learner_with_due(3, WordState::Learning);
    let before = learner.to_document();

    decide(
        &mut learner,
        Request::NextPassage,
        Frame::Content(ContentFrame {
            candidates: vec![composed("c", 4)],
            word_classes: all_one_class(&["w0", "w1", "w2"]),
            band_words: Vec::new(),
        }),
        now(),
        &tuning,
    );

    assert_eq!(before, learner.to_document(), "NextPassage is read-only");
}
