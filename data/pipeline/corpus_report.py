"""Reports what the sourced corpus actually covers — data/out/corpus_index.json
and a printed summary. Run after data/pipeline/excerpts.py.

Track T3b: "the question is not 'how many excerpts' but 'on a given day,
does some excerpt carry two of today's due words?'" This script answers
that, honestly, including the tail where it fails: for every word in the
5,000-25,000 teaching band, how many excerpts (across content/sources/*.json,
hand-authored and generated alike) carry it in informative context, and how
many band words have zero or one.

Usage: python data/pipeline/corpus_report.py
"""

from __future__ import annotations

import json
import pathlib
import sys
from collections import Counter, defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
SOURCES_DIR = ROOT / "content" / "sources"
FREQUENCY_PATH = ROOT / "data" / "out" / "frequency.json"
INDEX_OUT = ROOT / "data" / "out" / "corpus_index.json"

BAND_MIN_RANK = 5_000
BAND_MAX_RANK = 25_000


def load_band_words() -> set[str]:
    table = json.loads(FREQUENCY_PATH.read_text(encoding="utf-8"))
    return {row["word"] for row in table if BAND_MIN_RANK <= row["rank"] <= BAND_MAX_RANK}


def load_excerpts() -> list[dict]:
    docs = []
    for path in sorted(SOURCES_DIR.glob("*.json")):
        if path.name.startswith("_"):
            continue
        docs.append(json.loads(path.read_text(encoding="utf-8")))
    return docs


def build_index(docs: list[dict]) -> dict[str, list[str]]:
    index: dict[str, list[str]] = defaultdict(list)
    for doc in docs:
        # ADR-026: words is an array of {word, signals} objects, not bare
        # strings. The index only ever needed the word itself.
        for entry in doc.get("words", []):
            word = entry["word"] if isinstance(entry, dict) else entry
            index[word.lower()].append(doc["id"])
    return dict(sorted(index.items()))


def coverage_report(index: dict[str, list[str]], band_words: set[str]) -> dict:
    covered = {w: len(ids) for w, ids in index.items() if w in band_words}
    zero = sorted(band_words - set(covered))
    # wordfreq's "best" list carries a small amount of non-word noise at
    # this rank (timestamps, size codes: "3am", "4k") — real but a rounding
    # error against the 20,001-word band, and not this script's to fix
    # (data/pipeline/frequency.py is a dependency, not this track's output).
    # The zero-coverage *preview* below is filtered to real words for
    # readability; the counts above are the honest, unfiltered ones.
    zero_preview = [w for w in zero if w.isalpha()]
    one = sorted(w for w, n in covered.items() if n == 1)
    two_plus = sorted(w for w, n in covered.items() if n >= 2)
    histogram = Counter(min(n, 10) for n in covered.values())  # 10 = "10 or more"
    return {
        "band_size": len(band_words),
        "zero_excerpt_words": len(zero),
        "one_excerpt_words": len(one),
        "two_plus_excerpt_words": len(two_plus),
        "zero_sample": zero_preview[:40],
        "histogram": dict(sorted(histogram.items())),
    }


def topic_report(docs: list[dict]) -> Counter:
    return Counter(doc.get("topic", "<missing>") for doc in docs)


def main() -> int:
    band_words = load_band_words()
    docs = load_excerpts()
    index = build_index(docs)
    coverage = coverage_report(index, band_words)
    topics = topic_report(docs)

    INDEX_OUT.parent.mkdir(parents=True, exist_ok=True)
    INDEX_OUT.write_text(json.dumps(index, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"{len(docs)} sourced excerpts, {len(index)} distinct words indexed.")
    print(f"index written to {INDEX_OUT}")
    print()
    print(f"Teaching band (rank {BAND_MIN_RANK}-{BAND_MAX_RANK}): {coverage['band_size']} words")
    print(f"  0 excerpts:  {coverage['zero_excerpt_words']} words "
          f"({coverage['zero_excerpt_words'] / coverage['band_size']:.1%})")
    print(f"  1 excerpt:   {coverage['one_excerpt_words']} words "
          f"({coverage['one_excerpt_words'] / coverage['band_size']:.1%})")
    print(f"  2+ excerpts: {coverage['two_plus_excerpt_words']} words "
          f"({coverage['two_plus_excerpt_words'] / coverage['band_size']:.1%}) "
          f"— these clear min_sourced_coverage on their own")
    print(f"  distribution (excerpts per covered word, capped at 10+): {coverage['histogram']}")
    print()
    print("Zero-coverage sample (first 40, alphabetical):")
    print("  " + ", ".join(coverage["zero_sample"]))
    print()
    print("By topic:")
    for topic, count in topics.most_common():
        print(f"  {topic}: {count}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
