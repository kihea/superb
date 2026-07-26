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

SEED = 20260725  # fixed, same convention as pseudowords.py — never rolled
SAMPLE_SIZE = 120
BOOKS_TO_SWEEP = 24  # a cross-section, not the whole catalog — this is a spot-check, not a census
POSITIVE_TARGET = 90  # sample mostly from what the heuristic would ship...
NEGATIVE_TARGET = 30  # ...and a smaller arm of what it would reject, for a recall spot-check


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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("sample")
    sub.add_parser("judge")
    args = parser.parse_args()
    if args.command == "sample":
        return cmd_sample()
    return cmd_judge()


if __name__ == "__main__":
    raise SystemExit(main())
