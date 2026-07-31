"""Fixture cases for the filter-fix in `excerpts.py:windows_from_book`.

The bug (the verbatim-match falsifier's report): `windows_from_book` used
to drop short sentences ("Come in!" has 6 letters, "Ha!" has 2) from the
whole sentence list *before* windowing, then joined whatever survived as if
it had always been contiguous. 27 shipped excerpts read broken prose as a
result — e.g. src-gen-a-christmas-carol-010 read "...on every one. said
Scrooge; and walked across the room.", silently deleting two `"Come in!"`
exclamations from between them.

The fix stops joining across a dropped sentence: it locates every
sentence's real character offsets in the source and windows only within a
segment (a run of sentences with no dropped one between them), so a
window's text is always a genuinely contiguous slice of the source.

Every fixture below is checked, not assumed, to actually exercise the bug:
each snippet is long enough to clear `MIN_WORDS` on both sides of its
dropped sentence, and each assertion was confirmed to go red against the
pre-fix windowing (a plain filter-then-join over the same sentence list,
reproduced inline in this file's own tests as `_old_windows`) before being
trusted here — a PR review of this file's first version found that two of
the three original fixtures used snippets too short to ever produce a
window under either version of the code, making 5 of 6 assertions pass
vacuously. `_old_windows` exists so this file re-proves the point on every
run rather than trusting a review done once by hand.

The two novels' cached Project Gutenberg editions use real curly quotes and
em dashes; the text below is copied verbatim rather than folded to ASCII,
because folding it changes nltk's own sentence-boundary detection enough
to stop exercising the bug (found while building this fixture: a
straight-quote version of the Study in Scarlet passage no longer breaks the
same way a curly-quote one does). A Christmas Carol's own Gutenberg edition
already uses straight quotes, which is why that one text below is ASCII.

Run: python data/pipeline/tests/test_excerpts_windowing.py
"""

from __future__ import annotations

import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import excerpts as ex  # noqa: E402
from nltk.tokenize import sent_tokenize  # noqa: E402

# Source: A Christmas Carol (Project Gutenberg #46). The dropped sentence is
# `"Humbug!"` — 7 letters, below the noise floor.
#
# The leading sentence ("Old fire-guard...") is load-bearing, not padding:
# with it removed, the pre-fix windowing's greedy sizing lands the join at a
# different sentence boundary — one that opens on "There", which the
# self-containment rule rejects outright (both before and after this fix),
# so the broken window is silently dropped rather than shipped and this
# fixture would stop being able to fail. Found the hard way while widening
# this fixture: the first attempt started at "Quite satisfied" and
# `check_fixture`'s own load-bearing check correctly caught that it could
# never turn red.
CHRISTMAS_CAROL = (
    'Old fire-guard, old shoes, two fish-baskets, washing-stand on three '
    'legs, and a poker. Quite satisfied, he closed his door, and locked '
    'himself in; double-locked himself in, which was not his custom. Thus '
    'secured against surprise, he took off his cravat; put on his '
    'dressing-gown and slippers, and his nightcap; and sat down before '
    'the fire to take his gruel. It was a very low fire indeed; nothing '
    'on such a bitter night. He was obliged to sit close to it, and '
    'brood over it, before he could extract the least sensation of '
    'warmth from such a handful of fuel. The fireplace was an old one, '
    'built by some Dutch merchant long ago, and paved all round with '
    "quaint Dutch tiles, designed to illustrate the Scriptures. There "
    "were Cains and Abels, Pharaoh's daughters; Queens of Sheba, Angelic "
    'messengers descending through the air on clouds like feather-beds, '
    'Abrahams, Belshazzars, Apostles putting off to sea in butter-boats, '
    'hundreds of figures to attract his thoughts; and yet that face of '
    "Marley, seven years dead, came like the ancient Prophet's rod, and "
    'swallowed up the whole. If each smooth tile had been a blank at '
    'first, with power to shape some picture on its surface from the '
    "disjointed fragments of his thoughts, there would have been a copy "
    'of old Marley\'s head on every one. "Humbug!" said Scrooge; and '
    'walked across the room. After several turns, he sat down again. As '
    'he threw his head back in the chair, his glance happened to rest '
    'upon a bell, a disused bell, that hung in the room, and '
    'communicated for some purpose now forgotten with a chamber in the '
    'highest story of the building. It was with great astonishment, and '
    'with a strange, inexplicable dread, that as he looked, he saw this '
    'bell begin to swing. It swung so softly in the outset that it '
    'scarcely made a sound; but soon it rang out loudly, and so did '
    'every bell in the house. This might have lasted half a minute, or '
    'a minute, but it seemed an hour. The bells ceased as they had '
    'begun, together. They were succeeded by a clanking noise, deep '
    'down below; as if some person were dragging a heavy chain over '
    'the casks in the wine-merchant\'s cellar. Scrooge then remembered '
    'to have heard that ghosts in haunted houses were described as '
    'dragging chains.'
)

# Source: A Study in Scarlet (Project Gutenberg #244), verbatim including
# the edition's own curly quotes. The dropped sentence is `"Ha!` (nltk
# splits `"Ha! ha!"` at the internal exclamation mark, so only the first
# half — 2 letters — is short enough to drop; the second half, `ha!"`,
# survives and is what the old code stitched onto the sentence before it).
STUDY_IN_SCARLET = (
    'Had he discovered a gold mine, greater delight could not have shone '
    'upon his features. “Dr. Watson, Mr. Sherlock Holmes,” said '
    'Stamford, introducing us. “How are you?” he said cordially, '
    'gripping my hand with a strength for which I should hardly have given '
    'him credit. “You have been in Afghanistan, I perceive.” '
    '“How on earth did you know that?” I asked in astonishment. '
    '“Never mind,” said he, chuckling to himself. “The '
    'question now is about hæmoglobin. No doubt you see the '
    'significance of this discovery of mine?” “It is '
    'interesting, chemically, no doubt,” I answered, “but '
    'practically——” “Why, man, it is the most '
    'practical medico-legal discovery for years. Don’t you see that '
    'it gives us an infallible test for blood stains. Come over here '
    'now!” He seized me by the coat-sleeve in his eagerness, and drew '
    'me over to the table at which he had been working. “Let us have '
    'some fresh blood,” he said, digging a long bodkin into his '
    'finger, and drawing off the resulting drop of blood in a chemical '
    'pipette. “Now, I add this small quantity of blood to a litre of '
    'water. You perceive that the resulting mixture has the appearance of '
    'pure water. The proportion of blood cannot be more than one in a '
    'million. I have no doubt, however, that we shall be able to obtain '
    'the characteristic reaction.” As he spoke, he threw into the '
    'vessel a few white crystals, and then added some drops of a '
    'transparent fluid. In an instant the contents assumed a dull '
    'mahogany colour, and a brownish dust was precipitated to the bottom '
    'of the glass jar. “Ha! ha!” he cried, clapping his hands, '
    'and looking as delighted as a child with a new toy. “What do '
    'you think of that?” “It seems to be a very delicate '
    'test,” I remarked. “Beautiful! beautiful! The old Guiacum '
    'test was very clumsy and uncertain. So is the microscopic '
    'examination for blood corpuscles. The latter is valueless if the '
    'stains are a few hours old. Now, this appears to act as well '
    'whether the blood is old or new. Had this test been invented, there '
    'are hundreds of men now walking the earth who would long ago have '
    'paid the penalty of their crimes.” “Indeed!” I '
    'murmured. “Criminal cases are continually hinging upon that one '
    'point. A man is suspected of a crime months perhaps after it has '
    'been committed. His linen or clothes are examined, and brownish '
    'stains discovered upon them. Are they blood stains, or mud stains, '
    'or rust stains, or fruit stains, or what are they? That is a '
    'question which has puzzled many an expert, and why? Because there '
    'was no reliable test. Now we have the Sherlock Holmes’ test, '
    'and there will no longer be any difficulty.”'
)

# Source: A Room with a View (Project Gutenberg #2641), verbatim including
# the edition's own curly quotes. The dropped sentence is `Ha! ha! ha!`
# — 6 letters.
ROOM_WITH_A_VIEW = (
    'Meanwhile Mr. Eager held her in civil converse; their little tiff '
    'was over. “So, Miss Honeychurch, you are travelling? As a '
    'student of art?” “Oh, dear me, no—oh, no!” '
    '“Perhaps as a student of human nature,” interposed Miss '
    'Lavish, “like myself?” “Oh, no. I am here as a '
    'tourist.” “Oh, indeed,” said Mr. Eager. “Are you '
    'indeed? If you will not think me rude, we residents sometimes pity '
    'you poor tourists not a little—handed about like a parcel of '
    'goods from Venice to Florence, from Florence to Rome, living herded '
    'together in pensions or hotels, quite unconscious of anything that '
    'is outside Baedeker, their one anxiety to get ‘done’ or '
    '‘through’ and go on somewhere else. The result is, they '
    'mix up towns, rivers, palaces in one inextricable whirl. You know '
    'the American girl in Punch who says: ‘Say, poppa, what did we '
    'see at Rome?’ And the father replies: ‘Why, guess Rome was '
    'the place where we saw the yaller dog.’ There’s travelling '
    'for you. Ha! ha! ha!” “I quite agree,” said Miss '
    'Lavish, who had several times tried to interrupt his mordant wit. '
    '“The narrowness and superficiality of the Anglo-Saxon tourist '
    'is nothing less than a menace.” “Quite so. Now, the '
    'English colony at Florence, Miss Honeychurch—and it is of '
    'considerable size, though, of course, not all equally—a few '
    'are here for trade, for example. But the greater part are students. '
    'Lady Helen Laverstock is at present busy over Fra Angelico. I '
    'mention her name because we are passing her villa on the left. No, '
    'you can only see it if you stand—no, do not stand; you will '
    'fall. She is very proud of that thick hedge. Inside, perfect '
    'seclusion. One might have gone back six hundred years. Some critics '
    'believe that her garden was the scene of The Decameron, which lends '
    'it an additional interest, does it not?” “It does '
    'indeed!” cried Miss Lavish. “Tell me, where do they place '
    'the scene of that wonderful seventh day?” But Mr. Eager '
    'proceeded to tell Miss Honeychurch that on the right lived Mr. '
    'Someone Something, an American of the best type—so rare!—'
    'and that the Somebody Elses were farther down the hill. '
    '“Doubtless you know her monographs in the series of '
    '‘Mediæval Byways’? He is working at Gemistus Pletho.'
)


def _old_windows(body: str) -> list[str]:
    """The pre-fix behavior: filter noise out of the whole sentence list,
    then join whatever survives as one contiguous sequence. Reproduced
    here (not imported — the module under test no longer has this
    function) so every fixture below is checked against it on every run,
    rather than trusted from a one-time hand check."""
    sentences = [ex.clean_sentence_text(s) for s in sent_tokenize(body)]
    sentences = [
        s
        for s in sentences
        if s
        and not s.isupper()
        and len(re.findall(r"[A-Za-z]", s)) >= max(8, len(s) // 4)
    ]
    windows: list[str] = []
    i = 0
    n = len(sentences)
    while i < n:
        best: str | None = None
        best_span = 0
        for span in range(ex.MIN_SENTENCES, ex.MAX_SENTENCES + 1):
            if i + span > n:
                break
            candidate = " ".join(sentences[i : i + span])
            wc = len(candidate.split())
            if ex.MIN_WORDS <= wc <= ex.MAX_WORDS:
                best = candidate
                best_span = span
            elif wc > ex.MAX_WORDS:
                break
        if best is not None:
            if not ex.LEADING_PRONOUN_RE.match(best):
                windows.append(best)
            i += best_span
        else:
            i += 1
    return windows


def check(label: str, condition: bool, detail: str, problems: list[str]) -> None:
    if not condition:
        problems.append(f"{label}: {detail}")


def check_fixture(name: str, source: str, marker: str, problems: list[str]) -> None:
    """A fixture only proves something if it can fail. Confirm the marker
    (the broken join) actually appears under the pre-fix behavior before
    trusting its absence under the current one."""
    old_joined = " | ".join(_old_windows(source))
    check(
        f"{name}: fixture is load-bearing (marker appears under pre-fix windowing)",
        marker in old_joined,
        f"marker {marker!r} never appeared even under the old join-across-drops "
        f"behavior — this fixture cannot fail and proves nothing; got old windows: "
        f"{_old_windows(source)!r}",
        problems,
    )
    new_windows = ex.windows_from_book(source)
    new_joined = " | ".join(new_windows)
    check(
        f"{name}: the fixed windowing never produces the broken join",
        marker not in new_joined,
        f"got windows: {new_windows!r}",
        problems,
    )


def main() -> int:
    problems: list[str] = []

    check_fixture(
        "a christmas carol",
        CHRISTMAS_CAROL,
        "every one. said Scrooge",
        problems,
    )
    check_fixture(
        "a study in scarlet",
        STUDY_IN_SCARLET,
        "jar. ha!” he cried",
        problems,
    )
    check_fixture(
        "a room with a view",
        ROOM_WITH_A_VIEW,
        "travelling for you. ha!” “I quite agree",
        problems,
    )

    if problems:
        print(f"{len(problems)} failure(s):", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    print("windows_from_book never joins across a dropped sentence (6/6 checks, "
          "each confirmed load-bearing against the pre-fix behavior).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
