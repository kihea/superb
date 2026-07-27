"""ADVISORY-012 SS3, step 2: draw a hand-judged sample from the usage-register
coverage screening's NEW fires -- (word, excerpt) claims the current pipeline
does not make, that usage-register overlap does. Reads
`usage_register_coverage_result.json` (step 1's output, already committed)
and draws a uniform random sample of them, word and text only -- no signal,
no overlap words, no verdict -- so the key gets written blind, same
discipline as `corpus_precision_sample.json`'s own method note.

Run: python data/pipeline/tests/draw_usage_coverage_sample.py
Then write data/pipeline/tests/usage_coverage_key.json by hand, reading only
usage_coverage_sample.json, against PRECISION-STANDARD.md -- before running
any scoring script.
"""
from __future__ import annotations

import json
import pathlib
import random
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(ROOT / "data" / "pipeline"))

HERE = pathlib.Path(__file__).parent
SOURCE_RESULT = HERE / "usage_register_coverage_result.json"
SAMPLE_PATH = HERE / "usage_coverage_sample.json"
HIDDEN_PATH = HERE / ".usage_coverage_hidden.json"
SOURCES = ROOT / "content" / "sources"

SEED = 20260727  # fixed, never rolled -- same convention as every other frozen sample in this track
SAMPLE_SIZE = 60  # matches the original before-fix precision sample's size


def work_for(excerpt_id: str) -> str:
    path = SOURCES / f"{excerpt_id}.json"
    if not path.exists():
        return "?"
    doc = json.loads(path.read_text(encoding="utf-8"))
    return doc.get("provenance", {}).get("work", "?")


def text_for(excerpt_id: str) -> str:
    path = SOURCES / f"{excerpt_id}.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    return doc.get("text", "")


def main() -> int:
    doc = json.loads(SOURCE_RESULT.read_text(encoding="utf-8"))
    all_fired = doc["all_fired"]  # the complete new-fire population, not a pre-capped subset
    rng = random.Random(SEED)
    pool = list(all_fired)
    rng.shuffle(pool)
    chosen = pool[:SAMPLE_SIZE]

    hidden: dict[str, dict] = {}
    visible: list[dict] = []
    for i, c in enumerate(chosen):
        sid = f"u{i:03d}"
        hidden[sid] = {"overlap": c["overlap"], "excerpt_id": c["excerpt_id"]}
        visible.append({
            "id": sid,
            "excerpt_id": c["excerpt_id"],
            "word": c["word"],
            "text": text_for(c["excerpt_id"]),
            "work": work_for(c["excerpt_id"]),
        })

    SAMPLE_PATH.write_text(json.dumps(visible, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    HIDDEN_PATH.write_text(json.dumps(hidden, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {len(visible)} unlabelled samples to {SAMPLE_PATH}")
    print("Write data/pipeline/tests/usage_coverage_key.json next, reading only "
          "the sample file, against PRECISION-STANDARD.md -- then score.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
