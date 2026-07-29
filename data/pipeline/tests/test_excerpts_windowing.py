"""Fixture cases for the filter-fix in `excerpts.py:windows_from_book`.

The bug (workspace/reviews/VERBATIM-MATCH.md, "What the 174 GAPPED excerpts
drop, and why"): `windows_from_book` used to drop short sentences ("Come
in!" has 6 letters, "Ha!" has 2) from the whole sentence list *before*
windowing, then joined whatever survived as if it had always been
contiguous. 27 shipped excerpts read broken prose as a result — e.g.
src-gen-a-christmas-carol-010 read "...on every one. said Scrooge; and
walked across the room.", silently deleting two `"Come in!"` exclamations
from between them.

The fix stops joining across a dropped sentence: it splits the sentence
stream into segments at every sentence the noise filter flags, and windows
each segment on its own, so a window's text is always a genuinely
contiguous span of the source. The three passages below are the exact
source text (Project Gutenberg, quotes normalised to ASCII) behind three of
the 27 broken excerpts the review named — src-gen-a-christmas-carol-003 (the
Marley's-head passage backing -003 and this file's -010 case share the same
paragraph), src-gen-a-study-in-scarlet-002, and src-gen-a-room-with-a-
view-007.

Run: python data/pipeline/tests/test_excerpts_windowing.py
"""

from __future__ import annotations

import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import excerpts as ex  # noqa: E402

# Source: A Christmas Carol (Project Gutenberg #46). The dropped sentence is
# `"Humbug!"` — 7 letters, below the noise floor.
CHRISTMAS_CAROL = (
    'Quite satisfied, he closed his door, and locked himself in; '
    'double-locked himself in, which was not his custom. Thus secured '
    'against surprise, he took off his cravat; put on his dressing-gown and '
    'slippers, and his nightcap; and sat down before the fire to take his '
    'gruel. It was a very low fire indeed; nothing on such a bitter night. '
    'He was obliged to sit close to it, and brood over it, before he could '
    'extract the least sensation of warmth from such a handful of fuel. '
    'The fireplace was an old one, built by some Dutch merchant long ago, '
    'and paved all round with quaint Dutch tiles, designed to illustrate '
    "the Scriptures. There were Cains and Abels, Pharaoh's daughters; "
    'Queens of Sheba, Angelic messengers descending through the air on '
    'clouds like feather-beds, Abrahams, Belshazzars, Apostles putting off '
    'to sea in butter-boats, hundreds of figures to attract his thoughts; '
    'and yet that face of Marley, seven years dead, came like the ancient '
    "Prophet's rod, and swallowed up the whole. If each smooth tile had "
    'been a blank at first, with power to shape some picture on its '
    'surface from the disjointed fragments of his thoughts, there would '
    "have been a copy of old Marley's head on every one. "
    '"Humbug!" said Scrooge; and walked across the room. After several '
    'turns, he sat down again. As he threw his head back in the chair, '
    'his glance happened to rest upon a bell, a disused bell, that hung '
    'in the room, and communicated for some purpose now forgotten with a '
    'chamber in the highest story of the building. It was with great '
    'astonishment, and with a strange, inexplicable dread, that as he '
    'looked, he saw this bell begin to swing. It swung so softly in the '
    'outset that it scarcely made a sound; but soon it rang out loudly, '
    'and so did every bell in the house.'
)

# Source: A Study in Scarlet (Project Gutenberg #244). The dropped sentence
# is `"Ha! ha!"` — 4 letters.
STUDY_IN_SCARLET = (
    'In an instant the contents assumed a dull mahogany colour, and a '
    'brownish dust was precipitated to the bottom of the glass jar. '
    '"Ha! ha!" he cried, clapping his hands, and looking as delighted as '
    'a child with a new toy. "What do you think of that?" "It seems to '
    'be a very delicate test," I remarked. "Beautiful! beautiful! The '
    'old Guiacum test was very clumsy and uncertain. So is the '
    'microscopic examination for blood corpuscles. The latter is '
    'valueless if the stains are a few hours old."'
)

# Source: A Room with a View (Project Gutenberg #2641). The dropped
# sentence is `"Ha! ha! ha!"` — 6 letters.
ROOM_WITH_A_VIEW = (
    'And the father replies: "Why, guess Rome was the place where we saw '
    'the yaller dog." There\'s travelling for you. "Ha! ha! ha!" '
    '"I quite agree," said Miss Lavish, who had several times tried to '
    'interrupt his mordant wit. "The narrowness and superficiality of '
    'the Anglo-Saxon tourist is nothing less than a menace."'
)


def check(label: str, condition: bool, detail: str, problems: list[str]) -> None:
    if not condition:
        problems.append(f"{label}: {detail}")


def main() -> int:
    problems: list[str] = []

    windows = ex.windows_from_book(CHRISTMAS_CAROL)
    joined = " | ".join(windows)
    check(
        "a christmas carol: 'Humbug!' is never bridged into one window",
        "every one. said Scrooge" not in joined,
        f"got windows: {windows!r}",
        problems,
    )
    check(
        "a christmas carol: no window runs past the drop into the next segment",
        all("Humbug" not in w for w in windows),
        f"got windows: {windows!r}",
        problems,
    )
    check(
        "a christmas carol: the text after the drop still forms a window",
        any(w.startswith("said Scrooge;") for w in windows),
        f"got windows: {windows!r}",
        problems,
    )

    windows = ex.windows_from_book(STUDY_IN_SCARLET)
    joined = " | ".join(windows)
    check(
        "a study in scarlet: 'Ha! ha!' is never bridged into one window",
        "glass jar. he cried, clapping" not in joined,
        f"got windows: {windows!r}",
        problems,
    )

    windows = ex.windows_from_book(ROOM_WITH_A_VIEW)
    joined = " | ".join(windows)
    check(
        "a room with a view: 'Ha! ha! ha!' is never bridged into one window",
        "travelling for you. I quite agree" not in joined,
        f"got windows: {windows!r}",
        problems,
    )

    if problems:
        print(f"{len(problems)} failure(s):", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    print("windows_from_book never joins across a dropped sentence (5/5 checks).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
