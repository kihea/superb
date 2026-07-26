"""Measures data/pipeline/excerpts.py's informativeness heuristic by hand.

Track T3b's honesty requirement: "Write your answer key before you look at
the classifier's output... A number with a known error rate is usable; one
with an unknown error rate is not." This script is split into two commands
that must be run in that order, with a human (or an agent acting as one)
reading only the first command's output before writing the key:

    python data/pipeline/tests/measure_informativeness.py sample
        Draws a stratified random sample of (word, window) pairs from the
        candidate pool across a sweep of the book catalog and writes it to
        data/pipeline/tests/informativeness_sample.json — word and window
        text only, no heuristic verdict, no signal reason. This is the file
        the judge reads.

    python data/pipeline/tests/measure_informativeness.py judge <ANSWER_KEY>
        Loads a hand-written key (data/pipeline/tests/informativeness_key.json
        — one entry per sample id, {"informative": true|false}, written by
        reading *only* the sample file above) and the heuristic's own verdicts
        (recomputed fresh here, never stored until this point), and reports
        precision and a recall spot-check, broken out by which signal fired.

The sample is drawn once and checked into
data/pipeline/tests/informativeness_sample.json so the measurement is
reproducible; the key lives beside it, also checked in, so the number in the
PR can be re-derived rather than taken on faith.

**M2 item 5b's finding: the two commands above answer a *diagnostic*
question, never a corpus-wide one.** `sample` stratifies its positive arm
evenly across the three gating signals (~30 each) "so a single loud signal
cannot dominate the sample and hide a weak one" — right for finding which
signal is weak, wrong for characterizing the corpus, because the signals do
not fire anywhere near equally often (apposition and definition-marker
together are a few percent of real claims; gloss-overlap is the rest). PR #34
reported the stratified blend (56%) as the corpus's precision; the PR #34
verifier reweighted the same per-signal numbers by real incidence and got
≈44%. Reweighting a diagnostic sample after the fact is one way to correct
for this. **The commands below are the corrected instrument**: they draw
uniformly from the corpus's actual shipped claims, so incidence-weighting is
a property of the draw, not an arithmetic correction applied afterward.

    python data/pipeline/tests/measure_informativeness.py sample-corpus
        Draws a *uniform* random sample of (word, excerpt) pairs from every
        claim the shipped corpus actually makes (every `words` entry in
        every content/sources/*.json file) and writes it to
        corpus_precision_sample.json. No stratification by signal — a word
        claimed thousands of times by gloss-overlap and one claimed a few
        dozen times by definition-marker appear in the sample in roughly
        that same proportion, because that is the corpus a reader actually
        receives. (The already-committed corpus_precision_sample.json /
        _key.json are the frozen, hand-judged baseline this track's PR
        reports against — see PRECISION-STANDARD.md; re-running this command
        draws a fresh sample and does not overwrite them unless you choose
        to.)

    python data/pipeline/tests/measure_informativeness.py judge-corpus
        Same shape as `judge`, against corpus_precision_key.json. The
        reported overall precision is the corpus-wide number by
        construction — no reweighting step, nothing to get backwards.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import random
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(ROOT / "data" / "pipeline"))

import excerpts as ex  # noqa: E402

HERE = pathlib.Path(__file__).parent
SAMPLE_PATH = HERE / "informativeness_sample.json"
KEY_PATH = HERE / "informativeness_key.json"
CORPUS_SAMPLE_PATH = HERE / "corpus_precision_sample.json"
CORPUS_KEY_PATH = HERE / "corpus_precision_key.json"
SOURCES_DIR = ROOT / "content" / "sources"

SEED = 20260725  # fixed, same convention as pseudowords.py — never rolled
SAMPLE_SIZE = 120
BOOKS_TO_SWEEP = 24  # a cross-section, not the whole catalog — this is a spot-check, not a census
POSITIVE_TARGET = 90  # sample mostly from what the heuristic would ship...
NEGATIVE_TARGET = 30  # ...and a smaller arm of what it would reject, for a recall spot-check
CORPUS_SAMPLE_SIZE = 60  # matches the already-frozen corpus_precision_sample.json — see PRECISION-STANDARD.md


def collect_candidate_pairs() -> list[dict]:
    """Every (word, window) instance across a sweep of the catalog, with the
    heuristic's verdict attached — kept in memory only, not written until
    `judge` runs, so `sample` truly cannot see it."""
    band = ex.load_frequency_band()
    glosses = ex.load_glosses()
    rng = random.Random(SEED)
    books = list(ex.BOOK_CATALOG)
    rng.shuffle(books)
    books = books[:BOOKS_TO_SWEEP]

    pairs: list[dict] = []
    for entry in books:
        try:
            raw = ex.fetch_book(entry["gutenberg_id"])
        except Exception as e:  # pragma: no cover — network flakiness during a manual run
            print(f"  ! skipping {entry['work']!r}: {e}", file=sys.stderr)
            continue
        body = ex.strip_boilerplate(raw)
        start = ex.find_body_start(body)
        body = ex.strip_chapter_headings(body[start:])
        for window in ex.windows_from_book(body):
            band_words = ex.band_words_in(window, band)
            for w in band_words:
                ok, reason = ex.is_informative(w, window, glosses)
                pairs.append(
                    {
                        "word": w,
                        "text": window,
                        "work": entry["work"],
                        "verdict": ok,
                        "reason": reason,
                    }
                )
    return pairs


def cmd_sample() -> int:
    pairs = collect_candidate_pairs()
    positives = [p for p in pairs if p["verdict"]]
    negatives = [p for p in pairs if not p["verdict"]]
    print(f"candidate pool: {len(pairs)} pairs ({len(positives)} positive, {len(negatives)} negative)", file=sys.stderr)

    rng = random.Random(SEED)
    # Stratify the positive arm across signal categories so a single loud
    # signal cannot dominate the sample and hide a weak one.
    by_reason: dict[str, list[dict]] = {}
    for p in positives:
        by_reason.setdefault(p["reason"], []).append(p)
    for bucket in by_reason.values():
        rng.shuffle(bucket)

    reasons = sorted(by_reason)
    per_reason = max(1, POSITIVE_TARGET // max(1, len(reasons)))
    positive_sample: list[dict] = []
    for reason in reasons:
        positive_sample.extend(by_reason[reason][:per_reason])
    # top up from whatever's left, in case a category was thin
    leftover = [p for r in reasons for p in by_reason[r][per_reason:]]
    rng.shuffle(leftover)
    while len(positive_sample) < POSITIVE_TARGET and leftover:
        positive_sample.append(leftover.pop())

    rng.shuffle(negatives)
    negative_sample = negatives[:NEGATIVE_TARGET]

    sample = positive_sample + negative_sample
    rng.shuffle(sample)  # judge sees positives and negatives interleaved, unlabelled

    hidden: dict[str, dict] = {}
    visible: list[dict] = []
    for i, p in enumerate(sample):
        sid = f"s{i:03d}"
        hidden[sid] = {"verdict": p["verdict"], "reason": p["reason"]}
        visible.append({"id": sid, "word": p["word"], "text": p["text"], "work": p["work"]})

    SAMPLE_PATH.write_text(json.dumps(visible, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    # The hidden verdicts are cached separately, gitignored, purely so
    # `judge` doesn't have to re-fetch and re-run the heuristic over the
    # whole sweep a second time. It is never read by a human and is not the
    # source of truth `judge` reports against — `judge` recomputes the
    # heuristic fresh from BOOK_CATALOG + the sample's own (word, text)
    # pairs, so a stale cache here cannot silently change the reported
    # number.
    (HERE / ".informativeness_hidden.json").write_text(
        json.dumps(hidden, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"wrote {len(visible)} unlabelled samples to {SAMPLE_PATH}")
    print(f"  ({len(positive_sample)} drawn from the heuristic's positive calls, "
          f"{len(negative_sample)} from its negative calls)")
    print("Write data/pipeline/tests/informativeness_key.json next, reading only "
          "the sample file — then run `judge`.")
    return 0


def cmd_judge() -> int:
    if not SAMPLE_PATH.exists():
        raise SystemExit("run `sample` first")
    if not KEY_PATH.exists():
        raise SystemExit(
            f"{KEY_PATH} does not exist — write the key by hand first, "
            "reading only informativeness_sample.json"
        )
    sample = json.loads(SAMPLE_PATH.read_text(encoding="utf-8"))
    key = json.loads(KEY_PATH.read_text(encoding="utf-8"))
    glosses = ex.load_glosses()

    missing = [s["id"] for s in sample if s["id"] not in key]
    if missing:
        raise SystemExit(f"key is missing entries for: {missing}")

    rows = []
    for s in sample:
        ok, reason = ex.is_informative(s["word"], s["text"], glosses)
        rows.append({"id": s["id"], "word": s["word"], "heuristic": ok, "reason": reason, "key": key[s["id"]]["informative"]})

    positives = [r for r in rows if r["heuristic"]]
    negatives = [r for r in rows if not r["heuristic"]]
    tp = sum(1 for r in positives if r["key"])
    fp = sum(1 for r in positives if not r["key"])
    precision = tp / len(positives) if positives else float("nan")

    # Recall spot-check: of the sample the heuristic rejected, how many did
    # the key call informative anyway? Not a true recall (the negative arm
    # is a sample of rejections, not of the whole positive-in-truth
    # population), but it is the honest bound this pool can give.
    fn_in_sample = sum(1 for r in negatives if r["key"])
    miss_rate = fn_in_sample / len(negatives) if negatives else float("nan")

    print(f"n = {len(rows)} ({len(positives)} heuristic-positive, {len(negatives)} heuristic-negative)")
    print(f"precision (heuristic said informative, key agrees): {tp}/{len(positives)} = {precision:.0%}")
    print(f"  false positives: {fp}")
    print(f"miss rate on the negative-arm spot-check (key says informative, heuristic rejected): "
          f"{fn_in_sample}/{len(negatives)} = {miss_rate:.0%}")

    print("\nprecision by signal:")
    by_reason: dict[str, list[dict]] = {}
    for r in positives:
        by_reason.setdefault(r["reason"], []).append(r)
    for reason, group in sorted(by_reason.items(), key=lambda kv: -len(kv[1])):
        tp_r = sum(1 for r in group if r["key"])
        print(f"  {reason}: {tp_r}/{len(group)} = {tp_r/len(group):.0%}  (n={len(group)})")

    return 0


def collect_corpus_pairs() -> list[dict]:
    """Every (word, excerpt) claim the shipped corpus actually makes — one
    entry per `words[i]` in every content/sources/*.json file, hand-authored
    and generated alike. This *is* the population `Candidate.words` draws
    from at read time, so a uniform sample of it is a corpus-wide estimate
    by construction, with no reweighting step afterward to get wrong.
    """
    glosses = ex.load_glosses()
    pairs: list[dict] = []
    for path in sorted(SOURCES_DIR.glob("*.json")):
        if path.stem.startswith("_"):
            continue
        doc = json.loads(path.read_text(encoding="utf-8"))
        text = doc.get("text", "")
        work = doc.get("provenance", {}).get("work", "")
        for word in doc.get("words", []):
            ok, reason = ex.is_informative(word, text, glosses)
            pairs.append({
                "word": word, "text": text, "excerpt_id": doc.get("id", path.stem),
                "work": work, "verdict": ok, "reason": reason,
            })
    return pairs


def cmd_sample_corpus() -> int:
    pairs = collect_corpus_pairs()
    print(f"shipped claim population: {len(pairs)} (word, excerpt) pairs", file=sys.stderr)

    rng = random.Random(SEED)
    shuffled = list(pairs)
    rng.shuffle(shuffled)
    sample = shuffled[:CORPUS_SAMPLE_SIZE]

    hidden: dict[str, dict] = {}
    visible: list[dict] = []
    for i, p in enumerate(sample):
        sid = f"c{i:03d}"
        hidden[sid] = {"verdict": p["verdict"], "reason": p["reason"]}
        visible.append({"id": sid, "excerpt_id": p["excerpt_id"], "word": p["word"], "text": p["text"], "work": p["work"]})

    CORPUS_SAMPLE_PATH.write_text(json.dumps(visible, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (HERE / ".corpus_precision_hidden.json").write_text(
        json.dumps(hidden, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"wrote {len(visible)} unlabelled, uniformly-drawn samples to {CORPUS_SAMPLE_PATH}")
    print("Write data/pipeline/tests/corpus_precision_key.json next, reading only "
          "the sample file — then run `judge-corpus`.")
    return 0


def cmd_judge_corpus() -> int:
    if not CORPUS_SAMPLE_PATH.exists():
        raise SystemExit("run `sample-corpus` first")
    if not CORPUS_KEY_PATH.exists():
        raise SystemExit(
            f"{CORPUS_KEY_PATH} does not exist — write the key by hand first, "
            "reading only corpus_precision_sample.json, against PRECISION-STANDARD.md"
        )
    sample = json.loads(CORPUS_SAMPLE_PATH.read_text(encoding="utf-8"))
    key_doc = json.loads(CORPUS_KEY_PATH.read_text(encoding="utf-8"))
    key = key_doc["verdicts"] if "verdicts" in key_doc else key_doc
    glosses = ex.load_glosses()

    missing = [s["id"] for s in sample if s["id"] not in key]
    if missing:
        raise SystemExit(f"key is missing entries for: {missing}")

    rows = []
    for s in sample:
        ok, reason = ex.is_informative(s["word"], s["text"], glosses)
        entry = key[s["id"]]
        verdict = entry["informative"] if isinstance(entry, dict) else entry
        rows.append({"id": s["id"], "word": s["word"], "heuristic": ok, "reason": reason, "key": verdict})

    # Every shipped claim was, by construction, a heuristic-positive at the
    # time the corpus was built. A row that recomputes False here means the
    # code or the glosses changed since — expected and wanted after this
    # track's fix, worth surfacing rather than silently dropping.
    stale = [r for r in rows if not r["heuristic"]]
    positives = [r for r in rows if r["heuristic"]]
    tp = sum(1 for r in positives if r["key"])
    precision = tp / len(positives) if positives else float("nan")

    print(f"n = {len(rows)} shipped claims sampled uniformly (no stratification)")
    if stale:
        print(f"  {len(stale)} no longer recompute as informative under the current code/glosses "
              "(the corpus predates this run — regenerate it, or note the drift)")
    print(f"corpus-wide precision (uniform sample, incidence-weighted by construction): "
          f"{tp}/{len(positives)} = {precision:.1%}")

    print("\nprecision by signal (diagnostic — n's here reflect real incidence, not a stratified target):")
    by_reason: dict[str, list[dict]] = {}
    for r in positives:
        by_reason.setdefault(r["reason"], []).append(r)
    for reason, group in sorted(by_reason.items(), key=lambda kv: -len(kv[1])):
        tp_r = sum(1 for r in group if r["key"])
        print(f"  {reason}: {tp_r}/{len(group)} = {tp_r/len(group):.0%}  (n={len(group)})")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("sample")
    sub.add_parser("judge")
    sub.add_parser("sample-corpus")
    sub.add_parser("judge-corpus")
    args = parser.parse_args()
    if args.command == "sample":
        return cmd_sample()
    if args.command == "judge":
        return cmd_judge()
    if args.command == "sample-corpus":
        return cmd_sample_corpus()
    return cmd_judge_corpus()


if __name__ == "__main__":
    raise SystemExit(main())
