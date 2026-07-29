"""Word difficulty table — writes content/difficulty.json (ADR-029).

The engine's ability model is a one-parameter logistic: a reader's chance of
knowing a word is sigmoid(theta - difficulty), with both numbers on one logit
scale (crates/superb-core/src/ability.rs). The engine consumes difficulties;
nothing produced them until this script. Without them the web shell could not
answer Needs::PassageCandidates properly -- it handed back the whole lexicon
in class-id order and ignored the difficulty band entirely, so a brand-new
reader's first words were chosen by where a filename sorts.

The mapping, per ADR-029:

    difficulty(word) = LOGITS_PER_ZIPF * (ANCHOR_ZIPF - zipf(word))

ANCHOR_ZIPF is derived rather than chosen: it is the Zipf frequency of the
word at ANCHOR_RANK, the easy edge of the teaching band frequency.py already
defines. So difficulty 0 is the most common word this app teaches at all, and
a fresh reader (theta = 0) is served the easy end of its vocabulary.

LOGITS_PER_ZIPF = 1.0 is asserted, not measured -- a word ten times rarer is
one logit harder. What is derived is that it cannot be much larger: the
authored lexicon spans about 5 Zipf units, so a scale above ~1.25 pushes the
rarest authored words past theta_max and makes them unreachable by any legal
theta. ADR-029 names the falsifier and says plainly that the slope is a guess.

Source: `wordfreq` (Apache-2.0 code), the same version-pinned table
frequency.py uses; see data/MANIFEST.md for the licence row and data/NOTICE.md
for the attribution this project carries. No new dataset enters the build.

Deterministic: wordfreq's English list is static for a pinned package version,
the class lexicon is read from disk, and output keys are sorted -- so the same
inputs always produce the same bytes. tests/test_difficulty.py regenerates and
byte-diffs the committed artifact, which is how a class member added without
regenerating fails the build instead of silently producing a word the shell
cannot rank.

Run: python data/pipeline/difficulty.py
"""

from __future__ import annotations

import json
import sys
import tomllib
from pathlib import Path

from wordfreq import top_n_list, zipf_frequency

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
CLASSES_DIR = REPO_ROOT / "content" / "classes"
TUNING_PATH = REPO_ROOT / "crates" / "superb-core" / "tuning.toml"
OUT_PATH = REPO_ROOT / "content" / "difficulty.json"

# The teaching band's easy edge, as frequency.py's own 5,000-25,000 band
# names it. The word at this rank sits at difficulty 0.
ANCHOR_RANK = 5_000

# Pinned so a wordfreq version bump moves the whole scale visibly rather than
# silently. If this assertion fires, the frequency table changed under us:
# decide whether to accept the new anchor, then update this number in the same
# commit as the regenerated artifact.
EXPECTED_ANCHOR_ZIPF = 4.22

# ADR-029's one asserted constant.
LOGITS_PER_ZIPF = 1.0

# How many decimal places the shipped table carries. Two is far finer than the
# 0.8-logit band it is read against, and keeps the artifact diffable.
PLACES = 2


def anchor_zipf() -> float:
    """The Zipf frequency at the teaching band's easy edge."""
    word = top_n_list("en", ANCHOR_RANK, wordlist="best")[-1]
    return round(zipf_frequency(word, "en", wordlist="best"), 2)


def class_words() -> list[str]:
    """Every word that can be placed into a composed slot, deduplicated.

    Only these words are worth a difficulty: the band words the shell hands
    back must be placeable, and a word with no slot class cannot be placed.
    """
    words: set[str] = set()
    for path in sorted(CLASSES_DIR.glob("*.json")):
        words.update(json.loads(path.read_text(encoding="utf-8"))["members"])
    return sorted(words)


def theta_bounds() -> tuple[float, float]:
    """The clamp, read from tuning.toml rather than copied.

    Two artifacts that must agree get derived from one, never maintained by
    care -- so if the clamp is ever narrowed, this script's reachability check
    narrows with it instead of silently going stale.
    """
    tuning = tomllib.loads(TUNING_PATH.read_text(encoding="utf-8"))
    return float(tuning["theta_min"]), float(tuning["theta_max"])


def build() -> dict:
    measured = anchor_zipf()
    if measured != EXPECTED_ANCHOR_ZIPF:
        raise SystemExit(
            f"anchor moved: rank {ANCHOR_RANK} is now Zipf {measured}, expected "
            f"{EXPECTED_ANCHOR_ZIPF}. The frequency table changed. Accept the new "
            f"anchor deliberately (every word's difficulty shifts with it) and "
            f"update EXPECTED_ANCHOR_ZIPF in the same commit as the regenerated "
            f"content/difficulty.json."
        )

    theta_min, theta_max = theta_bounds()
    words = class_words()

    unknown = [w for w in words if zipf_frequency(w, "en", wordlist="best") == 0.0]
    if unknown:
        raise SystemExit(
            f"{len(unknown)} slot-class member(s) are absent from wordfreq's English "
            f"list entirely, which almost always means a typo in "
            f"content/classes/_seed.py: {', '.join(unknown)}. A word with no "
            f"frequency has no difficulty and cannot be scheduled."
        )

    table = {
        word: round(
            LOGITS_PER_ZIPF * (measured - zipf_frequency(word, "en", wordlist="best")),
            PLACES,
        )
        for word in words
    }

    unreachable = {w: d for w, d in table.items() if not theta_min < d < theta_max}
    if unreachable:
        raise SystemExit(
            f"{len(unreachable)} word(s) fall outside the theta clamp "
            f"({theta_min}, {theta_max}) and could never be served to any reader: "
            f"{unreachable}. Either the word is too rare to teach, or "
            f"LOGITS_PER_ZIPF is too steep -- ADR-029 derives its ceiling."
        )

    return {
        "anchorRank": ANCHOR_RANK,
        "anchorZipf": measured,
        "logitsPerZipf": LOGITS_PER_ZIPF,
        "note": (
            "difficulty = logitsPerZipf * (anchorZipf - zipf(word)), on the same "
            "logit scale as the engine's theta. Generated by "
            "data/pipeline/difficulty.py from wordfreq; see ADR-029. Do not "
            "hand-edit."
        ),
        "words": table,
    }


def serialize(document: dict) -> str:
    return json.dumps(document, ensure_ascii=False, indent=2, sort_keys=False) + "\n"


def write(document: dict) -> Path:
    OUT_PATH.write_text(serialize(document), encoding="utf-8")
    return OUT_PATH


if __name__ == "__main__":
    path = write(build())
    print(f"wrote {path}", file=sys.stderr)
