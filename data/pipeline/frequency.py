"""Frequency table — writes data/out/frequency.json.

Source: `wordfreq` (Robyn Speer, Apache-2.0 code). The English list blends
Google Books Ngrams, Wikipedia, Leeds/OpenSubtitles, and the SUBTLEX-US word
list, which its author Marc Brysbaert gave wordfreq's maintainer written
permission to redistribute "for any purpose, not just academic use" (see
NOTICE.md, recorded in data/MANIFEST.md). That permission is what clears the
SUBTLEX-US ambiguity law 4 exists to catch — unlike SWOW-EN or the USF norms,
this one is documented and commercial use is explicitly allowed.

Deterministic: wordfreq's English list is static for a pinned package
version (requirements.txt pins it), so the same version always produces the
same bytes.
"""

from __future__ import annotations

import json
from pathlib import Path

from wordfreq import top_n_list, zipf_frequency

OUT_DIR = Path(__file__).resolve().parent.parent / "out"
WORD_COUNT = 30_000  # covers the 5,000-25,000 teaching band with headroom


def build() -> list[dict]:
    words = top_n_list("en", WORD_COUNT, wordlist="best")
    table = [
        {
            "word": word,
            "rank": rank,
            "zipf": round(zipf_frequency(word, "en", wordlist="best"), 2),
        }
        for rank, word in enumerate(words, start=1)
    ]
    return table


def write(table: list[dict]) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / "frequency.json"
    out_path.write_text(
        json.dumps(table, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return out_path


if __name__ == "__main__":
    path = write(build())
    print(f"wrote {path}")
