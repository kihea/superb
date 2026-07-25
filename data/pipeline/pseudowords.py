"""Pseudoword list — writes data/out/pseudowords.json.

These calibrate the engine's guessing correction (a learner who "knows" a
pseudoword is guessing, not recalling — see docs/engine-contract.md). They
must look like plausible English words and mean nothing, so they are
generated from an English syllable model, not sourced from any dataset.
Every syllable piece here is a hand-written phonotactic fact about English,
not extracted text, so there is no licence to record.

Deterministic: a fixed seed and a fixed generation order produce the same
list every run. Generated candidates are rejected if they collide with a
real English word (checked against wordfreq's list, so a pseudoword never
turns out to secretly be a real one) or repeat.
"""

from __future__ import annotations

import json
import random
from pathlib import Path

from wordfreq import zipf_frequency

OUT_DIR = Path(__file__).resolve().parent.parent / "out"
SEED = 20260725  # fixed: today's date the pipeline was written, never rolled
TARGET_COUNT = 200

# Onsets, nuclei and codas restricted to clusters that are common in ordinary
# English words, so results read as plausible rather than alien.
ONSETS = [
    "", "b", "br", "bl", "c", "cr", "cl", "ch", "d", "dr", "f", "fr", "fl",
    "g", "gr", "gl", "h", "j", "k", "l", "m", "n", "p", "pr", "pl", "qu",
    "r", "s", "sc", "sh", "sk", "sl", "sm", "sn", "sp", "st", "str", "sw",
    "t", "tr", "th", "v", "w", "wh", "y", "z",
]
# A lighter onset set for non-initial syllables, so multi-syllable words
# keep a natural interior instead of stacking two consonant clusters back
# to back (real English rarely does "...shk..." or "...lstr...").
INNER_ONSETS = [
    "b", "c", "d", "f", "g", "j", "k", "l", "m", "n", "p", "r", "s", "t",
    "v", "w",
]
NUCLEI = [
    "a", "e", "i", "o", "u", "ai", "ea", "ee", "oa", "oo", "ou", "ie", "oi",
]
CODAS = [
    "", "b", "ck", "d", "ff", "g", "l", "ld", "lk", "lm", "lt", "m", "mp",
    "n", "nd", "ng", "nk", "nt", "p", "r", "rk", "rl", "rn", "rp", "rt",
    "s", "sh", "sk", "sp", "ss", "st", "t", "th", "ve", "x", "z",
]
# Interior (non-final) syllables stay open or end on a single soft
# consonant, mirroring how real English words break between syllables.
INNER_CODAS = ["", "", "", "n", "m", "l", "r"]


def _syllable(rng: random.Random, *, initial: bool, final: bool) -> str:
    onset = rng.choice(ONSETS) if initial else rng.choice(INNER_ONSETS)
    coda = rng.choice(CODAS) if final else rng.choice(INNER_CODAS)
    return onset + rng.choice(NUCLEI) + coda


def _candidate(rng: random.Random) -> str:
    syllable_count = rng.choices([1, 2, 3], weights=[3, 6, 1])[0]
    syllables = [
        _syllable(rng, initial=(i == 0), final=(i == syllable_count - 1))
        for i in range(syllable_count)
    ]
    return "".join(syllables)


def _looks_like_a_word(word: str) -> bool:
    # Reject anything with an awkward run of consonants or vowels that no
    # ordinary English word has, so pseudowords still look pronounceable.
    if len(word) < 3 or len(word) > 12:
        return False
    vowels = set("aeiou")
    run = 0
    kind = None
    for ch in word:
        this_kind = "v" if ch in vowels else "c"
        run = run + 1 if this_kind == kind else 1
        kind = this_kind
        if run > 3:
            return False
    return True


def _is_real_word(word: str) -> bool:
    # zipf_frequency returns 0.0 for anything wordfreq has never seen.
    return zipf_frequency(word, "en", wordlist="best") > 0.0


def build() -> list[str]:
    rng = random.Random(SEED)
    seen: set[str] = set()
    pseudowords: list[str] = []
    # A generous, deterministic attempt cap: random generation can collide
    # or produce real words, so we keep drawing (in the same fixed order)
    # until we have enough or give up.
    for _ in range(TARGET_COUNT * 50):
        if len(pseudowords) >= TARGET_COUNT:
            break
        word = _candidate(rng)
        if word in seen or not _looks_like_a_word(word) or _is_real_word(word):
            continue
        seen.add(word)
        pseudowords.append(word)
    pseudowords.sort()
    return pseudowords


def write(pseudowords: list[str]) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / "pseudowords.json"
    out_path.write_text(
        json.dumps(pseudowords, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return out_path


if __name__ == "__main__":
    path = write(build())
    print(f"wrote {path}")
