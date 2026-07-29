"""M2 item 5b / ADVISORY-010 SS2: the precision/coverage frontier table.

ADVISORY-010 ruled that a bare precision floor "is a coverage decision
wearing a precision costume" -- stating one number silently picks how much
of the teaching band gets discarded, and nobody had made that choice on the
record. This script is the fix: for a sweep of frequency-rank floors applied
to the gloss-overlap signal's overlapping word (apposition and
definition-marker pass through untouched -- PRECISION-STANDARD.md's own
finding is that the weakness is gloss-overlap specifically, at 96.2% of all
claims), it reports the four columns ADVISORY-010 SS2 names:

  - rank floor
  - precision, with n and a 95% Wilson interval, pooled from the frozen
    before-fix (n=60, seed 20260725) and after-fix (n=40, seed 20260726)
    hand-judged samples -- pooling is defensible because PR #40's own
    after-measurement found no statistically distinguishable shift between
    the two (50.0% vs 45.0%, heavily overlapping intervals), so treating
    them as one n=100 draw against the current corpus narrows the interval
    without manufacturing precision that isn't there
  - band coverage at >=1 and >=2 excerpts, recomputed against the full,
    current corpus -- a census over every shipped excerpt, so no sampling
    interval is needed
  - surviving claims, out of the full corpus's real word-claim population

Run: python data/pipeline/tests/frontier_table.py
"""
from __future__ import annotations

import json
import math
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(ROOT / "data" / "pipeline"))
import excerpts as ex  # noqa: E402

HERE = pathlib.Path(__file__).parent
SOURCES = ROOT / "content" / "sources"

RANK_FLOORS = [0, 500, 1000, 2000, 3000, 5000, 10000]
BAND_MIN, BAND_MAX = ex.BAND_MIN_RANK, ex.BAND_MAX_RANK


def survives(word: str, text: str, glosses: dict, rank: dict, floor: int) -> tuple[bool, str]:
    """The same gate `excerpts.is_informative` applies, except a gloss-overlap
    verdict must also clear a frequency-rank floor on its rarest overlapping
    word (floor=0 is the unmodified heuristic, exactly what's shipped).
    Apposition and definition-marker verdicts are untouched at every floor --
    PRECISION-STANDARD.md diagnosed the weakness as gloss-overlap specifically,
    and moving a floor that structural signals don't need would misattribute
    the frontier to a mechanism the diagnosis never implicated."""
    ok, reason = ex.is_informative(word, text, glosses)
    # `is_informative` returns every gating signal that fired, as a list
    # (ADR-026, checked regardless of a co-firing trusted signal), not the
    # single string this comparison originally assumed -- unrelated to
    # corpus size, this line has silently never matched since ADR-026
    # landed, which disabled the floor sweep below at every floor above 0
    # (confirmed: it produces identical rows for every floor without this
    # fix). A claim survives the floor check only when gloss-overlap is its
    # *sole* fired signal -- if apposition or definition-marker also fired,
    # it is untouched at every floor, matching this function's own
    # docstring.
    if not ok or reason != ["gloss-overlap"] or floor <= 0:
        return ok, reason
    gloss = glosses.get(word.lower())
    if not gloss:
        return False, "none"
    gloss_words = ex.content_words(gloss)
    sentence_words = ex.content_words(text) - {word.lower()}
    overlap = gloss_words & sentence_words
    if not overlap:
        return False, "none"
    best_rank = max((rank.get(w, 10**9) for w in overlap), default=10**9)
    return (best_rank > floor), reason


def load_rank() -> dict[str, int]:
    table = json.loads((ROOT / "data" / "out" / "frequency.json").read_text(encoding="utf-8"))
    return {r["word"]: r["rank"] for r in table}


def pooled_sample() -> list[dict]:
    """The frozen before-fix (n=60) and after-fix (n=40) hand-judged
    samples, pooled -- see this file's own docstring for why pooling is
    defensible here rather than double-counting a single measurement."""
    rows = []
    before_sample = json.loads((HERE / "corpus_precision_sample.json").read_text(encoding="utf-8"))
    before_key = json.loads((HERE / "corpus_precision_key.json").read_text(encoding="utf-8"))["verdicts"]
    for s in before_sample:
        entry = before_key[s["id"]]
        hand = entry["informative"] if isinstance(entry, dict) else entry
        rows.append({"word": s["word"], "text": s["text"], "hand": hand})
    after_sample = json.loads((HERE / "corpus_precision_sample_after.json").read_text(encoding="utf-8"))
    after_key_doc = json.loads((HERE / "corpus_precision_key_after.json").read_text(encoding="utf-8"))
    after_key = after_key_doc["verdicts"]
    for s in after_sample:
        entry = after_key[s["id"]]
        hand = entry["informative"] if isinstance(entry, dict) else entry
        rows.append({"word": s["word"], "text": s["text"], "hand": hand})
    return rows


def wilson_ci(tp: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (float("nan"), float("nan"))
    p = tp / n
    denom = 1 + z * z / n
    centre = p + z * z / (2 * n)
    adj = z * math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)
    return ((centre - adj) / denom, (centre + adj) / denom)


def corpus_claims() -> list[dict]:
    claims = []
    for path in sorted(SOURCES.glob("*.json")):
        if path.stem.startswith("_"):
            continue
        doc = json.loads(path.read_text(encoding="utf-8"))
        for w in doc.get("words", []):
            # ADR-026's schema stores each claim as {"word": ..., "signals":
            # [...]}, not a bare string -- unrelated to corpus size, this
            # script has never read that shape correctly (confirmed: it
            # crashes the same way against the corpus as it stood the day
            # FRONTIER-TABLE.md was first generated, commit 2b49451).
            word = w["word"] if isinstance(w, dict) else w
            claims.append({"word": word, "text": doc["text"]})
    return claims


def band_words(rank: dict) -> set[str]:
    return {w for w, r in rank.items() if BAND_MIN <= r <= BAND_MAX}


def main() -> int:
    rank = load_rank()
    glosses = ex.load_glosses()
    sample = pooled_sample()
    claims = corpus_claims()
    band = band_words(rank)

    n_files = len([p for p in SOURCES.glob("*.json") if not p.stem.startswith("_")])
    print(f"pooled hand-judged sample: n={len(sample)} (60 before-fix + 40 after-fix, PR #40)")
    print(f"corpus claim population: {len(claims)} (word, excerpt) pairs, {n_files} excerpt files")
    print(f"teaching band (rank {BAND_MIN}-{BAND_MAX}): {len(band)} words")
    print()
    header = (
        f"{'rank floor':>10} | {'precision':>9} | {'n':>4} | {'95% CI':>15} | "
        f"{'>=1':>7} | {'>=2':>7} | {'surviving claims':>17}"
    )
    print(header)
    print("-" * len(header))

    rows = []
    for floor in RANK_FLOORS:
        # precision on the pooled hand-judged sample, at this floor
        fired = []
        for s in sample:
            ok, _reason = survives(s["word"], s["text"], glosses, rank, floor)
            if ok:
                fired.append(s)
        tp = sum(1 for s in fired if s["hand"])
        n = len(fired)
        precision = tp / n if n else float("nan")
        lo, hi = wilson_ci(tp, n) if n else (float("nan"), float("nan"))

        # band coverage + surviving claims, over the full corpus (a census)
        covered: dict[str, int] = {}
        surviving = 0
        for c in claims:
            ok, _reason = survives(c["word"], c["text"], glosses, rank, floor)
            if ok:
                surviving += 1
                covered[c["word"].lower()] = covered.get(c["word"].lower(), 0) + 1
        one_plus = sum(1 for w in band if covered.get(w, 0) >= 1)
        two_plus = sum(1 for w in band if covered.get(w, 0) >= 2)

        rows.append(
            {
                "rank_floor": floor,
                "precision": precision,
                "n": n,
                "ci_low": lo,
                "ci_high": hi,
                "band_coverage_1plus": one_plus / len(band),
                "band_coverage_2plus": two_plus / len(band),
                "surviving_claims": surviving,
            }
        )
        print(
            f"{floor:>10} | {precision:>8.1%} | {n:>4} | [{lo:.1%}, {hi:.1%}] | "
            f"{one_plus/len(band):>6.1%} | {two_plus/len(band):>6.1%} | {surviving:>17}"
        )

    out_path = HERE / "frontier_table_result.json"
    out_path.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print(f"\nwrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
