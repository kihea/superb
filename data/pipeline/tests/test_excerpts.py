"""Proves the M2 item 5b fix to `excerpts.py`'s proper-noun candidacy check.

The diagnosis (found in this track's manual precision pass, PRECISION-
STANDARD.md): `_looks_like_proper_noun` correctly excludes a capitalised
mid-sentence token as a likely name ("Thornton", "Kitty"), but a name that
happens to *open* a sentence slips past it, because a capital there is not
evidence on its own — an ordinary word is capitalised at a sentence start
too. "tommy" (dated slang for a British soldier) is a real dictionary word,
so when a real excerpt opened with "Tommy Beresford was one of those young
Englishmen...", the corpus claimed "tommy" as a taught vocabulary word —
not a wrong dictionary sense (that is `glosses.py`'s fix), but not a
vocabulary claim at all: the excerpt never uses the common-noun sense.

The fix: if the same capitalised spelling is *unambiguously* a name
somewhere else in the same window (mid-sentence, per the existing check),
every occurrence of that spelling in the window is treated as the name,
including any sentence-initial one.

Run: python data/pipeline/tests/test_excerpts.py
"""

from __future__ import annotations

import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import excerpts as ex  # noqa: E402


def check(label: str, condition: bool, detail: str, problems: list[str]) -> None:
    if not condition:
        problems.append(f"{label}: {detail}")


def main() -> int:
    problems: list[str] = []
    band = {"tommy": 12000, "urbanity": 15000, "spring": 9000}

    # 1. The regression: a name that opens a sentence, and recurs
    # confidently mid-sentence elsewhere in the same window, is excluded
    # everywhere in the window — including the sentence-initial mention.
    tommy_text = (
        "Tommy Beresford was one of those young Englishmen not distinguished "
        "by any special intellectual ability. Tommy realized perfectly that "
        "in his own wits lay the only chance of escape. \"Simply lots of "
        "things,\" replied Tommy with the same urbanity as before."
    )
    check(
        "a sentence-initial name recurring mid-sentence elsewhere is excluded",
        "tommy" not in ex.band_words_in(tommy_text, band),
        f"got {ex.band_words_in(tommy_text, band)!r}",
        problems,
    )

    # 2. An ordinary band word that only ever opens a sentence (never
    # recurs mid-sentence capitalised) is unaffected — the fix must not
    # start rejecting real sentence-initial vocabulary on capitalisation
    # alone, which is exactly the over-reach `_looks_like_proper_noun`
    # already declines to make.
    spring_text = (
        "Spring came late that year. The fields stayed bare long after the "
        "first birds returned, and everyone spoke of it as a spring that "
        "would not commit to itself."
    )
    check(
        "a sentence-initial ordinary word with no confident recurrence is kept",
        "spring" in ex.band_words_in(spring_text, band),
        f"got {ex.band_words_in(spring_text, band)!r}",
        problems,
    )

    # 3. A name that is *only* ever mid-sentence (never sentence-initial)
    # keeps behaving exactly as before the fix — this is a strict addition,
    # not a replacement, of the existing per-occurrence check.
    mid_only_text = "He turned to see Tommy standing there, and Tommy said nothing."
    check(
        "a name that never opens a sentence is still excluded as before",
        "tommy" not in ex.band_words_in(mid_only_text, band),
        f"got {ex.band_words_in(mid_only_text, band)!r}",
        problems,
    )

    if problems:
        print(f"{len(problems)} failure(s):", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    print("excerpts.py excludes a recurring sentence-initial name (3/3 checks).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
