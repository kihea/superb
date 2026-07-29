"""The sourced-corpus ingestion pipeline — writes content/sources/src-gen-*.json.

Track T3b (workspace/tracks/T3-corpus-scale.md): the sourced share Kihea asked
for (ADR-015 amendment, "the sourced share is 60%") cannot be reached from 61
hand-picked excerpts, because `min_sourced_coverage` requires an excerpt to
carry two words that are due right now, in informative context — a small
library almost never clears that bar. This script is the fix: fetch public
domain prose from the three origins ADR-018 allow-lists, cut it into
self-contained windows, decide which teaching-band words each window explains
well enough to teach, and emit one file per surviving window, indexed and
reported honestly.

Pipeline stages, in order:

1. `fetch_book` — plain text from Project Gutenberg (cached under
   data/cache/gutenberg/, gitignored). Standard Ebooks and Wikisource are
   allow-listed by ADR-018 but are not wired up here: Gutenberg alone supplied
   enough volume to reach the corpus target, and adding a second and third
   fetcher for the same yield was not worth the added surface. Recorded as a
   real gap, not a silent one — see the PR body.
2. `strip_boilerplate` + `find_body_start` — cut Gutenberg's licence header
   and, heuristically, the editorial front matter (introductions, translator's
   notes) that many public-domain editions carry ahead of the author's own
   text. This errs toward dropping real chapter-one content over the opposite
   failure — crediting an editor's prose to the credited author — because the
   second failure is a law 4 citation-accuracy problem and the first is a
   small, tolerable coverage loss (§ "What this does not get right", below).
3. `windows_from_book` — nltk sentence segmentation, then non-overlapping
   2-5 sentence windows sized toward 80-200 words (matching the range
   content/scripts/check_sources.py already enforces on the hand-authored 60),
   rejecting windows that open on a bare pronoun with no antecedent inside the
   window — the self-containment rule the track names.
4. `band_words_in` — which 5,000-25,000 frequency-band words (data/out/
   frequency.json) a window's own tokens carry, matched as surface forms
   (wordfreq's list already holds inflections — "running" is its own entry —
   so no stemming step is needed or wanted; see the pipeline's dev notes).
5. `informative_words` — of those, which ones the window explains well enough
   that a reader could infer the meaning without already owning it. This is
   the heuristic `docs/seams.md` §Seam 2 requires and the one measured by
   hand in `data/pipeline/tests/measure_informativeness.py` — read that
   file's docstring before trusting a number from this one.
6. `assign_topic` — one topic label per *book*, not per excerpt (see
   BOOK_CATALOG's comment for the reasoning).

Usage: python data/pipeline/excerpts.py [--limit N] [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
import unicodedata
import urllib.error
import urllib.request

from nltk.tokenize import sent_tokenize

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
OUT_DIR = ROOT / "content" / "sources"
CACHE_DIR = ROOT / "data" / "cache" / "gutenberg"
FREQUENCY_PATH = ROOT / "data" / "out" / "frequency.json"
GLOSSES_PATH = ROOT / "data" / "out" / "glosses.json"

# The same basis string content/sources/_seed.py writes and
# check_license_gate.py verifies against each record's own year. It used to
# read "Public Domain (Project Gutenberg, US)" here and "Public Domain (US,
# life+70 expired)" there, so the corpus asserted two different legal bases
# for identically-situated works -- worse than either alone. Project
# Gutenberg's clearance is why these texts were *available*; publication
# before 1929 is why they are public domain, and the second is the one a
# stranger can check against the year in the same record.
PUBLIC_DOMAIN_BASIS = "Public Domain (US: published before 1929)"

BAND_MIN_RANK = 5_000
BAND_MAX_RANK = 25_000
MIN_WORDS = 80
MAX_WORDS = 200
MIN_SENTENCES = 2
MAX_SENTENCES = 5
RETRIEVED = "2026-07-25"

# A window may not open on one of these with no antecedent inside itself —
# the self-containment rule the track names ("no dangling pronoun referring
# outside the window").
LEADING_PRONOUN_RE = re.compile(
    r"^(he|she|it|they|him|her|them|his|hers|their|theirs|this|that|these|"
    r"those|there)\b",
    re.IGNORECASE,
)

# Case-insensitive, line-anchored: a real "Chapter N." heading stands alone on
# its line, so this does not also match a table-of-contents entry, which
# always carries a trailing page number on the same line.
CHAPTER_HEADING_RE = re.compile(
    r"^[ \t]*(chapter|book)\s+[ivxlc]+\.?[ \t]*$|^[ \t]*(chapter|book)\s+\d+\.?[ \t]*$",
    re.IGNORECASE | re.MULTILINE,
)

ILLUSTRATION_RE = re.compile(r"\[illustration:?.*?\]", re.IGNORECASE | re.DOTALL)
BRACKET_NOTE_RE = re.compile(r"\[(?:sidenote|footnote|note)\b.*?\]", re.IGNORECASE | re.DOTALL)

GUTENBERG_START_RE = re.compile(r"\*\*\*\s*START OF THE PROJECT GUTENBERG EBOOK.*?\*\*\*", re.IGNORECASE | re.DOTALL)
GUTENBERG_END_RE = re.compile(r"\*\*\*\s*END OF THE PROJECT GUTENBERG EBOOK", re.IGNORECASE)

FRONT_MATTER_FALLBACK_FRACTION = 0.08  # used only when no chapter headings are found

STOPWORDS = frozenset(
    """
    a about above after again against all am an and any are aren't as at be
    because been before being below between both but by can can't cannot
    could couldn't did didn't do does doesn't doing don't down during each
    few for from further had hadn't has hasn't have haven't having he he'd
    he'll he's her here here's hers herself him himself his how how's i i'd
    i'll i'm i've if in into is isn't it it's its itself let's me more most
    mustn't my myself no nor not of off on once only or other ought our ours
    ourselves out over own same shan't she she'd she'll she's should
    shouldn't so some such than that that's the their theirs them themselves
    then there there's these they they'd they'll they're they've this those
    through to too under until up very was wasn't we we'd we'll we're we've
    were weren't what what's when when's where where's which while who who's
    whom why why's with won't would wouldn't you you'd you'll you're you've
    your yours yourself yourselves upon shall must
    """.split()
)

# Contrast markers whose presence near a candidate word signals the sentence
# is doing the work of setting the word against a stated or implied opposite.
CONTRAST_MARKERS = ["but", "yet", "however", "unlike", "rather than", "instead of", "not"]
# "like" is deliberately excluded: the hand-measured sample
# (data/pipeline/tests/measure_informativeness.py) found it was the single
# biggest source of false positives, almost always a simile elsewhere in the
# window ("like a jockey-cap") rather than the candidate word being
# exemplified — it teaches nothing about the word it happens to sit near.
EXEMPLIFICATION_MARKERS = ["such as", "for example", "for instance", "including"]
DEFINITION_MARKERS = ["that is,", "that is to say", "namely", "in other words", "meaning", "which means"]


def gutenberg_text_url(gutenberg_id: int) -> str:
    return f"https://www.gutenberg.org/ebooks/{gutenberg_id}.txt.utf-8"


def fetch_book(gutenberg_id: int) -> str:
    """Plain text, cached under data/cache/gutenberg/ (gitignored)."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE_DIR / f"{gutenberg_id}.txt"
    if cache_path.exists():
        return cache_path.read_text(encoding="utf-8", errors="replace")
    url = gutenberg_text_url(gutenberg_id)
    req = urllib.request.Request(url, headers={"User-Agent": "superb-corpus-pipeline/1.0 (contact: see CONTRIBUTING.md)"})
    with urllib.request.urlopen(req, timeout=60) as response:
        raw = response.read()
    text = raw.decode("utf-8", errors="replace")
    cache_path.write_text(text, encoding="utf-8")
    return text


def strip_boilerplate(raw: str) -> str:
    """Cut Gutenberg's licence header/footer, leaving the book itself."""
    raw = raw.replace("\r\n", "\n").replace("\r", "\n")
    start_match = GUTENBERG_START_RE.search(raw)
    end_match = GUTENBERG_END_RE.search(raw)
    body = raw[start_match.end() : end_match.start()] if start_match and end_match else raw
    body = ILLUSTRATION_RE.sub(" ", body)
    body = BRACKET_NOTE_RE.sub(" ", body)
    # Illustration captions occasionally nest a second "]" that the
    # non-greedy match above stops short of, leaving a stray bracket or
    # unterminated fragment behind. Strip any leftover square-bracket noise
    # rather than risk it surviving into a window's text.
    body = re.sub(r"\[[^\]]{0,120}\]", " ", body)
    body = re.sub(r"[\[\]]", " ", body)
    # Gutenberg's plain-text convention marks italics/emphasis with
    # underscores (_casa_, _haute noblesse_). Left in, they survive as
    # literal underscores in what is supposed to be clean reading prose —
    # content/scripts/check_sources.py's own word-boundary check caught
    # this indirectly (an underscore is a \w character, so `_casa_` never
    # satisfies \bcasa\b). Keep the text, drop the markup. The emphasised
    # span can itself be line-wrapped ("_haute\n\nnoblesse_"), so this
    # matches across newlines too — capped at 200 chars so an unpaired
    # stray underscore later in the same chapter can't swallow everything
    # between it and the next one.
    body = re.sub(r"_([^_]{1,200})_", r"\1", body)
    return body


def find_body_start(body: str) -> int:
    """Best-effort cut past editorial front matter (see module docstring §2).

    Prefers the first line-anchored "Chapter"/"Book" heading when the text
    carries at least three of them (real chapter structure, not a stray
    reference). Otherwise falls back to skipping a fixed fraction of the
    text — most Gutenberg prefaces are shorter than that; the corpus report
    states this honestly rather than claiming precision the heuristic
    doesn't have.
    """
    headings = list(CHAPTER_HEADING_RE.finditer(body))
    if len(headings) >= 3:
        return headings[0].start()
    return int(len(body) * FRONT_MATTER_FALLBACK_FRACTION)


def strip_chapter_headings(body: str) -> str:
    """Blank out heading lines so a window never swallows "CHAPTER V." whole."""
    return CHAPTER_HEADING_RE.sub(" ", body)


def clean_sentence_text(raw: str) -> str:
    text = unicodedata.normalize("NFKC", raw)
    text = re.sub(r"[ \t]*\n[ \t]*", " ", text)  # de-hyphenate line-wrapped prose
    text = re.sub(r" {2,}", " ", text)
    return text.strip()


def windows_from_book(body: str) -> list[str]:
    """Non-overlapping 2-5 sentence windows sized toward 80-200 words.

    A window that opens on a bare pronoun is dropped — self-containment,
    the rule the track names — rather than repaired, because repairing it
    would mean guessing at an antecedent this script has no way to check.
    """
    sentences = [clean_sentence_text(s) for s in sent_tokenize(body)]
    # Drop stray running heads, captions, and formatting noise: anything
    # that is all-caps (a heading nltk mis-split from its neighbour) or that
    # has too little alphabetic content to be real prose.
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
        for span in range(MIN_SENTENCES, MAX_SENTENCES + 1):
            if i + span > n:
                break
            candidate = " ".join(sentences[i : i + span])
            wc = len(candidate.split())
            if MIN_WORDS <= wc <= MAX_WORDS:
                best = candidate  # keep extending while still in range
                best_span = span
            elif wc > MAX_WORDS:
                break
        if best is not None:
            if not LEADING_PRONOUN_RE.match(best):
                windows.append(best)
            i += best_span
        else:
            i += 1
    return windows


def load_frequency_band() -> dict[str, int]:
    if not FREQUENCY_PATH.exists():
        raise SystemExit("run data/pipeline/frequency.py first (excerpts.py reads its output)")
    table = json.loads(FREQUENCY_PATH.read_text(encoding="utf-8"))
    return {
        row["word"]: row["rank"]
        for row in table
        if BAND_MIN_RANK <= row["rank"] <= BAND_MAX_RANK
    }


def load_glosses() -> dict[str, str]:
    if not GLOSSES_PATH.exists():
        return {}
    return json.loads(GLOSSES_PATH.read_text(encoding="utf-8"))


# Unicode-aware letters, not [A-Za-z'] — an ASCII-only pattern splits an
# accented name like "Kurágin" (transliterated Russian, common across this
# catalog) at the diacritic into "Kur" and "gin", and "gin" is a real word.
# Found by content/scripts/check_sources.py's own (Unicode-aware) word-
# boundary check disagreeing with this tokenizer on 8 of the first 2,600
# excerpts. Apostrophes stay mid-token ("didn't") but do not start or end one.
TOKEN_RE = re.compile(r"[^\W\d_]+(?:'[^\W\d_]+)*")
SENTENCE_BOUNDARY_RE = re.compile(r'[.!?]["\')\]]*\s*$')
# A title abbreviation's period is not a sentence boundary — "Mr. Godfrey"
# is one clause, and without this the hand-measured sample found "Godfrey"
# survived the proper-noun filter because "Mr." in front of it looked like
# the end of a previous sentence.
TITLE_ABBREVIATION_RE = re.compile(r"\b(mr|mrs|ms|dr|st|mme|mlle|messrs|prof|rev|capt|col|gen|lt|sgt)\.\s*$", re.IGNORECASE)


def tokenize(text: str) -> list[str]:
    return [t.strip("'").lower() for t in TOKEN_RE.findall(text)]


def _looks_like_proper_noun(text: str, match: re.Match) -> bool:
    """A token capitalised in its *original* text, mid-sentence, is almost
    certainly a name — "Thornton", "Cornelius", "Kitty" all surfaced as
    false candidates in the hand-measured sample precisely this way,
    because the surface string happens to also be a common word. A
    sentence-initial capital is not evidence of a proper noun (ordinary
    words are capitalised there too), so this only fires mid-sentence.
    """
    token = match.group(0)
    if not token[:1].isupper():
        return False
    before = text[: match.start()]
    if not before.strip():
        return False  # start of the window — could be an ordinary word
    if TITLE_ABBREVIATION_RE.search(before):
        return True  # "Mr. Godfrey" — the period is a title, not a sentence end
    return not SENTENCE_BOUNDARY_RE.search(before)


def _confident_proper_noun_forms(text: str) -> set[str]:
    """Case-sensitive surface forms that `_looks_like_proper_noun` already
    trusts at least once in this window (capitalised, mid-sentence, no
    title-abbreviation ambiguity) — and therefore, on that same evidence,
    are a name everywhere else they recur here too, including a
    sentence-initial occurrence the per-occurrence check alone declines to
    call (a capital there is not evidence by itself; an ordinary word can
    open a sentence just as well as a name can).

    M2 item 5b's manual pass: "Tommy Beresford was one of those young
    Englishmen..." opens a window with the character's name in the one
    position `_looks_like_proper_noun` cannot use — but the same excerpt
    also carries "Tommy realized perfectly..." and "...replied Tommy with
    the same urbanity", both confidently mid-sentence. `tommy` is also a
    common noun (dated slang for a British soldier), so the old per-
    occurrence check let the sentence-initial mention through as a
    vocabulary claim on a name. This is not a wrong dictionary sense (item
    5b's `glosses.py` fix) — it is not a vocabulary claim at all, and no
    sense selection can repair a claim on a token that was never used as
    the common noun in this window.
    """
    return {
        match.group(0)
        for match in TOKEN_RE.finditer(text)
        if _looks_like_proper_noun(text, match)
    }


def band_words_in(text: str, band: dict[str, int]) -> list[str]:
    """Which band words this window's own tokens carry — surface forms,
    filtered against three failure modes the hand-measured sample found:

    - an ordinal suffix ("5th") gets split by TOKEN_RE into digits (dropped)
      and letters ("th"), and "th" happens to sit in the band; skip any
      token directly preceded by a digit, since it is a fragment, not a word.
    - a capitalised mid-sentence token is treated as a likely proper noun
      (see `_looks_like_proper_noun`) and excluded — a character's name
      that happens to spell a common word is not that word, in context.
    - the same name recurring at the *start* of a sentence, which the
      per-occurrence check above cannot tell apart from an ordinary
      capitalised word on its own — resolved by asking, window-wide,
      whether this exact capitalised spelling is already confidently a name
      somewhere else in the same window (see `_confident_proper_noun_forms`).
    """
    seen: list[str] = []
    confident_names = _confident_proper_noun_forms(text)
    for match in TOKEN_RE.finditer(text):
        start = match.start()
        if start > 0 and text[start - 1].isdigit():
            continue
        if match.group(0) in confident_names:
            continue
        if _looks_like_proper_noun(text, match):
            continue
        tok = match.group(0).strip("'").lower()
        if tok in band and tok not in seen:
            seen.append(tok)
    return seen


def content_words(text: str) -> set[str]:
    return {t for t in tokenize(text) if t not in STOPWORDS and len(t) > 2}


def is_informative(word: str, text: str, glosses: dict[str, str]) -> tuple[bool, list[str]]:
    """The heuristic measured in data/pipeline/tests/measure_informativeness.py.

    Four cheap, explainable signals, matching the track's brief: definitional
    apposition, contrastive framing, exemplification, and gloss overlap (a
    proxy for "strong selectional context" — the local sentence's content
    words overlap with the dictionary sense of the candidate word).

    **Only apposition, definition-marker, and gloss-overlap gate a window
    into "informative".** Contrast and exemplification are still detected —
    the reason is reported for the precision measurement's category
    breakdown — but neither is trusted to decide inclusion on its own. The
    hand-measured sample (data/pipeline/tests/informativeness_key.json)
    found both signals fire just as often on a marker attached to some
    *other* word in the window as on the candidate itself ("such as" or
    "but" a clause away, exemplifying or contrasting a neighbour, not the
    word being scored) — a scope-attachment problem a proximity window
    cannot resolve without an actual parser. Per the track's stated bias
    ("an excerpt claiming fewer words than it teaches costs coverage; one
    claiming more corrupts the schedule"), the fix is to stop trusting the
    two signals that measured weakest, not to keep narrowing them further.

    **All three gating signals are checked, not just the first to match**
    (ADR-026, workspace/decisions/README.md) — they co-fire at a measured
    0.6% of firings, and returning only the first would silently discard
    that every time it happened. The return value is `(informative, signals)`
    where `signals` holds every gating signal that fired, in a fixed order,
    or a single-element list naming the reported non-gating signal
    (`"exemplification"`, `"contrast"`) or `"none"` when nothing fired.
    """
    lower = text.lower()
    idx = lower.find(word.lower())
    if idx < 0:
        return False, "absent"
    window_start = max(0, idx - 60)
    window_end = min(len(lower), idx + len(word) + 60)
    local = lower[window_start:window_end]
    # A single-word marker ("namely", "meaning") can equal the candidate
    # word itself — DEFINITION_MARKERS ⊇ single tokens that are themselves
    # plausible band words. Left unmasked, the word's own occurrence would
    # always "find" the marker, which is not a signal about the word at
    # all. Blank out the word's own span before any marker search below.
    local_word_start = idx - window_start
    local_masked = local[:local_word_start] + " " * len(word) + local[local_word_start + len(word):]
    # Exemplification and definition markers conventionally explain the
    # term that comes *before* them ("tangible proof — such as ..."), not
    # one that happens to follow. The hand-measured sample's false
    # positives were almost all a marker elsewhere in the ±60-char window
    # attached to a different word entirely ("such as" explaining
    # "revenge", two words after an unrelated "vows"); restricting these
    # two signals to the forward half of the window measurably improved
    # precision without the cost of a real parser.
    local_after = lower[idx + len(word) : window_end]

    # 1. definitional apposition: "word, a/an/the ...," or an explicit gloss
    # marker close to the word. 2. gloss overlap — the sentence's own
    # content words echo the word's dictionary sense, which is the
    # cheapest proxy this pipeline has for "the passage supplies the
    # meaning" without hand-authoring one. Both gate inclusion, and both
    # are checked regardless of whether the other already fired, so a
    # window that satisfies more than one is recorded as such rather than
    # only ever reporting the first (ADR-026).
    signals: list[str] = []
    apposition_re = re.compile(
        re.escape(word.lower()) + r",\s*(a|an|the)\s+[a-z][^,.;]{2,60},"
    )
    if apposition_re.search(lower):
        signals.append("apposition")
    if any(m in local_after for m in DEFINITION_MARKERS):
        signals.append("definition-marker")
    gloss = glosses.get(word.lower())
    if gloss:
        gloss_words = content_words(gloss)
        sentence_words = content_words(text) - {word.lower()}
        if gloss_words & sentence_words:
            signals.append("gloss-overlap")
    if signals:
        return True, signals

    # 3. exemplification and 4. contrastive framing near the word are still
    # detected and reported — the precision measurement audits them — but
    # neither gates inclusion (see the docstring above). A window whose
    # only signal is one of these is reported as that reason, still False.
    if any(m in local_after for m in EXEMPLIFICATION_MARKERS):
        return False, ["exemplification"]
    if any(re.search(r"\b" + re.escape(m) + r"\b", local_masked) for m in CONTRAST_MARKERS):
        return False, ["contrast"]

    return False, ["none"]


def informative_words(text: str, band_words: list[str], glosses: dict[str, str]) -> list[tuple[str, list[str]]]:
    result = []
    for w in band_words:
        ok, signals = is_informative(w, text, glosses)
        if ok:
            result.append((w, signals))
    return result


def slugify(text: str, max_len: int = 40) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text[:max_len].rstrip("-")


def gutenberg_source_name(gutenberg_id: int) -> tuple[str, str]:
    return f"Project Gutenberg #{gutenberg_id}", f"https://www.gutenberg.org/ebooks/{gutenberg_id}"


# 127 public-domain works spanning 15 topic clusters: the 47 works the
# hand-authored 60 excerpts already drew from (content/sources/_seed.py,
# reused here so the pipeline can pull *more* excerpts from books already
# cleared) plus 80 further works, matched against Project Gutenberg's own
# catalog by title and author (data/pipeline/tests/ has no fixture for this
# match step — it is a one-time, inspectable data table, not runtime logic).
#
# Why a topic per book, not per excerpt: a per-excerpt topic classifier would
# need either a second heavy model or a second unproven heuristic, and a
# novel's own topic rarely drifts chapter to chapter the way its vocabulary
# does. Coarser, but honest, and it costs nothing extra to compute.
BOOK_CATALOG: list[dict] = [
    {"work": 'Moby-Dick; or, The Whale', "author": 'Herman Melville', "year": 1851, "gutenberg_id": 2701, "topic": 'sea'},
    {"work": 'Pride and Prejudice', "author": 'Jane Austen', "year": 1813, "gutenberg_id": 1342, "topic": 'household'},
    {"work": 'Frankenstein; or, The Modern Prometheus', "author": 'Mary Shelley', "year": 1818, "gutenberg_id": 84, "topic": 'invention'},
    {"work": 'Dracula', "author": 'Bram Stoker', "year": 1897, "gutenberg_id": 345, "topic": 'supernatural'},
    {"work": 'The Adventures of Sherlock Holmes', "author": 'Arthur Conan Doyle', "year": 1892, "gutenberg_id": 1661, "topic": 'mystery'},
    {"work": 'A Tale of Two Cities', "author": 'Charles Dickens', "year": 1859, "gutenberg_id": 98, "topic": 'war'},
    {"work": 'Jane Eyre', "author": 'Charlotte Brontë', "year": 1847, "gutenberg_id": 1260, "topic": 'courtship'},
    {"work": 'Adventures of Huckleberry Finn', "author": 'Mark Twain', "year": 1884, "gutenberg_id": 76, "topic": 'travel'},
    {"work": 'Great Expectations', "author": 'Charles Dickens', "year": 1861, "gutenberg_id": 1400, "topic": 'city'},
    {"work": 'Wuthering Heights', "author": 'Emily Brontë', "year": 1847, "gutenberg_id": 768, "topic": 'courtship'},
    {"work": 'The Picture of Dorian Gray', "author": 'Oscar Wilde', "year": 1890, "gutenberg_id": 174, "topic": 'supernatural'},
    {"work": 'Heart of Darkness', "author": 'Joseph Conrad', "year": 1899, "gutenberg_id": 219, "topic": 'wilderness'},
    {"work": 'The War of the Worlds', "author": 'H. G. Wells', "year": 1898, "gutenberg_id": 36, "topic": 'invention'},
    {"work": 'The Time Machine', "author": 'H. G. Wells', "year": 1895, "gutenberg_id": 35, "topic": 'invention'},
    {"work": 'Strange Case of Dr Jekyll and Mr Hyde', "author": 'Robert Louis Stevenson', "year": 1886, "gutenberg_id": 43, "topic": 'invention'},
    {"work": 'Treasure Island', "author": 'Robert Louis Stevenson', "year": 1883, "gutenberg_id": 120, "topic": 'sea'},
    {"work": 'The Adventures of Tom Sawyer', "author": 'Mark Twain', "year": 1876, "gutenberg_id": 74, "topic": 'childhood'},
    {"work": "Alice's Adventures in Wonderland", "author": 'Lewis Carroll', "year": 1865, "gutenberg_id": 11, "topic": 'childhood'},
    {"work": 'The Scarlet Letter', "author": 'Nathaniel Hawthorne', "year": 1850, "gutenberg_id": 33, "topic": 'mourning'},
    {"work": 'Walden', "author": 'Henry David Thoreau', "year": 1854, "gutenberg_id": 205, "topic": 'reflection'},
    {"work": 'The Souls of Black Folk', "author": 'W. E. B. Du Bois', "year": 1903, "gutenberg_id": 408, "topic": 'society'},
    {"work": 'Narrative of the Life of Frederick Douglass, an American Slave', "author": 'Frederick Douglass', "year": 1845, "gutenberg_id": 23, "topic": 'society'},
    {"work": 'The Yellow Wallpaper', "author": 'Charlotte Perkins Gilman', "year": 1892, "gutenberg_id": 1952, "topic": 'reflection'},
    {"work": 'The Awakening', "author": 'Kate Chopin', "year": 1899, "gutenberg_id": 160, "topic": 'society'},
    {"work": 'Ethan Frome', "author": 'Edith Wharton', "year": 1911, "gutenberg_id": 4517, "topic": 'rural'},
    {"work": 'The House of Mirth', "author": 'Edith Wharton', "year": 1905, "gutenberg_id": 284, "topic": 'society'},
    {"work": 'My Ántonia', "author": 'Willa Cather', "year": 1918, "gutenberg_id": 242, "topic": 'wilderness'},
    {"work": 'The Call of the Wild', "author": 'Jack London', "year": 1903, "gutenberg_id": 215, "topic": 'wilderness'},
    {"work": 'White Fang', "author": 'Jack London', "year": 1906, "gutenberg_id": 910, "topic": 'wilderness'},
    {"work": 'The Turn of the Screw', "author": 'Henry James', "year": 1898, "gutenberg_id": 209, "topic": 'supernatural'},
    {"work": 'Middlemarch', "author": 'George Eliot', "year": 1871, "gutenberg_id": 145, "topic": 'society'},
    {"work": 'Silas Marner', "author": 'George Eliot', "year": 1861, "gutenberg_id": 550, "topic": 'rural'},
    {"work": 'Vanity Fair', "author": 'William Makepeace Thackeray', "year": 1848, "gutenberg_id": 599, "topic": 'war'},
    {"work": 'David Copperfield', "author": 'Charles Dickens', "year": 1850, "gutenberg_id": 766, "topic": 'city'},
    {"work": 'Oliver Twist', "author": 'Charles Dickens', "year": 1838, "gutenberg_id": 730, "topic": 'city'},
    {"work": 'Emma', "author": 'Jane Austen', "year": 1815, "gutenberg_id": 158, "topic": 'household'},
    {"work": 'Persuasion', "author": 'Jane Austen', "year": 1817, "gutenberg_id": 105, "topic": 'courtship'},
    {"work": 'Anne of Green Gables', "author": 'L. M. Montgomery', "year": 1908, "gutenberg_id": 45, "topic": 'childhood'},
    {"work": 'The Secret Garden', "author": 'Frances Hodgson Burnett', "year": 1911, "gutenberg_id": 113, "topic": 'childhood'},
    {"work": 'Little Women', "author": 'Louisa May Alcott', "year": 1868, "gutenberg_id": 514, "topic": 'household'},
    {"work": 'Robinson Crusoe', "author": 'Daniel Defoe', "year": 1719, "gutenberg_id": 521, "topic": 'sea'},
    {"work": "Gulliver's Travels", "author": 'Jonathan Swift', "year": 1726, "gutenberg_id": 829, "topic": 'travel'},
    {"work": 'Notes from Underground', "author": 'Fyodor Dostoevsky', "year": 1864, "gutenberg_id": 600, "topic": 'reflection'},
    {"work": 'Crime and Punishment', "author": 'Fyodor Dostoevsky', "year": 1866, "gutenberg_id": 2554, "topic": 'mystery'},
    {"work": 'Anna Karenina', "author": 'Leo Tolstoy', "year": 1877, "gutenberg_id": 1399, "topic": 'courtship'},
    {"work": 'Twenty Thousand Leagues Under the Sea', "author": 'Jules Verne', "year": 1870, "gutenberg_id": 164, "topic": 'sea'},
    {"work": 'Around the World in Eighty Days', "author": 'Jules Verne', "year": 1873, "gutenberg_id": 103, "topic": 'travel'},
    {"work": 'Kidnapped', "author": 'Robert Louis Stevenson', "year": 1886, "gutenberg_id": 421, "topic": 'sea'},
    {"work": 'The Mysterious Island', "author": 'Jules Verne', "year": 1874, "gutenberg_id": 1268, "topic": 'sea'},
    {"work": 'Sense and Sensibility', "author": 'Jane Austen', "year": 1811, "gutenberg_id": 21839, "topic": 'household'},
    {"work": 'Cranford', "author": 'Elizabeth Gaskell', "year": 1853, "gutenberg_id": 394, "topic": 'household'},
    {"work": 'The Jungle Book', "author": 'Rudyard Kipling', "year": 1894, "gutenberg_id": 236, "topic": 'wilderness'},
    {"work": 'The Prairie', "author": 'James Fenimore Cooper', "year": 1827, "gutenberg_id": 18875, "topic": 'wilderness'},
    {"work": 'The Last of the Mohicans', "author": 'James Fenimore Cooper', "year": 1826, "gutenberg_id": 940, "topic": 'wilderness'},
    {"work": 'The Portrait of a Lady', "author": 'Henry James', "year": 1881, "gutenberg_id": 2833, "topic": 'courtship'},
    {"work": 'War and Peace', "author": 'Leo Tolstoy', "year": 1869, "gutenberg_id": 2600, "topic": 'war'},
    {"work": 'The Red Badge of Courage', "author": 'Stephen Crane', "year": 1895, "gutenberg_id": 73, "topic": 'war'},
    {"work": 'The Moonstone', "author": 'Wilkie Collins', "year": 1868, "gutenberg_id": 155, "topic": 'mystery'},
    {"work": 'The Woman in White', "author": 'Wilkie Collins', "year": 1859, "gutenberg_id": 583, "topic": 'mystery'},
    {"work": 'The Hound of the Baskervilles', "author": 'Arthur Conan Doyle', "year": 1902, "gutenberg_id": 2852, "topic": 'mystery'},
    {"work": 'The Sign of the Four', "author": 'Arthur Conan Doyle', "year": 1890, "gutenberg_id": 2097, "topic": 'mystery'},
    {"work": 'A Study in Scarlet', "author": 'Arthur Conan Doyle', "year": 1887, "gutenberg_id": 244, "topic": 'mystery'},
    {"work": 'The Innocence of Father Brown', "author": 'G. K. Chesterton', "year": 1911, "gutenberg_id": 204, "topic": 'mystery'},
    {"work": 'The Secret Adversary', "author": 'Agatha Christie', "year": 1922, "gutenberg_id": 1155, "topic": 'mystery'},
    {"work": 'The Secret of Chimneys', "author": 'Agatha Christie', "year": 1925, "gutenberg_id": 65238, "topic": 'mystery'},
    {"work": 'The Mysterious Affair at Styles', "author": 'Agatha Christie', "year": 1920, "gutenberg_id": 863, "topic": 'mystery'},
    {"work": 'The Thirty-Nine Steps', "author": 'John Buchan', "year": 1915, "gutenberg_id": 558, "topic": 'mystery'},
    {"work": 'The Mystery of the Yellow Room', "author": 'Gaston Leroux', "year": 1907, "gutenberg_id": 1685, "topic": 'mystery'},
    {"work": 'The Prince and the Pauper', "author": 'Mark Twain', "year": 1881, "gutenberg_id": 1837, "topic": 'travel'},
    {"work": "A Connecticut Yankee in King Arthur's Court", "author": 'Mark Twain', "year": 1889, "gutenberg_id": 86, "topic": 'travel'},
    {"work": 'Life on the Mississippi', "author": 'Mark Twain', "year": 1883, "gutenberg_id": 245, "topic": 'travel'},
    {"work": 'Peter Pan', "author": 'J. M. Barrie', "year": 1911, "gutenberg_id": 16, "topic": 'childhood'},
    {"work": 'The Wonderful Wizard of Oz', "author": 'L. Frank Baum', "year": 1900, "gutenberg_id": 55, "topic": 'childhood'},
    {"work": 'Black Beauty', "author": 'Anna Sewell', "year": 1877, "gutenberg_id": 271, "topic": 'childhood'},
    {"work": 'Meditations', "author": 'Marcus Aurelius', "year": 180, "gutenberg_id": 2680, "topic": 'reflection'},
    {"work": 'The Legend of Sleepy Hollow', "author": 'Washington Irving', "year": 1820, "gutenberg_id": 41, "topic": 'supernatural'},
    {"work": 'The Phantom of the Opera', "author": 'Gaston Leroux', "year": 1910, "gutenberg_id": 175, "topic": 'supernatural'},
    {"work": 'The Great God Pan', "author": 'Arthur Machen', "year": 1894, "gutenberg_id": 389, "topic": 'supernatural'},
    {"work": 'The King in Yellow', "author": 'Robert W. Chambers', "year": 1895, "gutenberg_id": 8492, "topic": 'supernatural'},
    {"work": 'The Call of Cthulhu', "author": 'H. P. Lovecraft', "year": 1928, "gutenberg_id": 68283, "topic": 'supernatural'},
    {"work": 'The Three Musketeers', "author": 'Alexandre Dumas', "year": 1844, "gutenberg_id": 1257, "topic": 'war'},
    {"work": 'The Count of Monte Cristo', "author": 'Alexandre Dumas', "year": 1844, "gutenberg_id": 1184, "topic": 'mystery'},
    {"work": 'The Secret Agent', "author": 'Joseph Conrad', "year": 1907, "gutenberg_id": 974, "topic": 'mystery'},
    {"work": 'A Room with a View', "author": 'E. M. Forster', "year": 1908, "gutenberg_id": 2641, "topic": 'courtship'},
    {"work": 'The Mysteries of Udolpho', "author": 'Ann Radcliffe', "year": 1794, "gutenberg_id": 3268, "topic": 'supernatural'},
    {"work": 'The Riddle of the Sands', "author": 'Erskine Childers', "year": 1903, "gutenberg_id": 2360, "topic": 'sea'},
    {"work": 'The Wisdom of Father Brown', "author": 'G. K. Chesterton', "year": 1914, "gutenberg_id": 223, "topic": 'mystery'},
    {"work": 'Two Years Before the Mast', "author": 'Richard Henry Dana', "year": 1840, "gutenberg_id": 2055, "topic": 'sea'},
    {"work": 'The Sea-Wolf', "author": 'Jack London', "year": 1904, "gutenberg_id": 1074, "topic": 'sea'},
    {"work": 'Typhoon', "author": 'Joseph Conrad', "year": 1902, "gutenberg_id": 1142, "topic": 'sea'},
    {"work": 'Captains Courageous', "author": 'Rudyard Kipling', "year": 1897, "gutenberg_id": 2186, "topic": 'sea'},
    {"work": 'Wives and Daughters', "author": 'Elizabeth Gaskell', "year": 1866, "gutenberg_id": 4274, "topic": 'household'},
    {"work": 'The Mill on the Floss', "author": 'George Eliot', "year": 1860, "gutenberg_id": 6688, "topic": 'household'},
    {"work": 'North and South', "author": 'Elizabeth Gaskell', "year": 1855, "gutenberg_id": 4276, "topic": 'household'},
    {"work": 'O Pioneers!', "author": 'Willa Cather', "year": 1913, "gutenberg_id": 24, "topic": 'wilderness'},
    {"work": 'The Song of the Lark', "author": 'Willa Cather', "year": 1915, "gutenberg_id": 44, "topic": 'wilderness'},
    {"work": 'Bleak House', "author": 'Charles Dickens', "year": 1853, "gutenberg_id": 1023, "topic": 'city'},
    {"work": 'Sister Carrie', "author": 'Theodore Dreiser', "year": 1900, "gutenberg_id": 5267, "topic": 'city'},
    {"work": 'A Christmas Carol', "author": 'Charles Dickens', "year": 1843, "gutenberg_id": 46, "topic": 'city'},
    {"work": 'Hard Times', "author": 'Charles Dickens', "year": 1854, "gutenberg_id": 786, "topic": 'city'},
    {"work": 'The Old Curiosity Shop', "author": 'Charles Dickens', "year": 1841, "gutenberg_id": 700, "topic": 'city'},
    {"work": 'Far from the Madding Crowd', "author": 'Thomas Hardy', "year": 1874, "gutenberg_id": 27, "topic": 'courtship'},
    {"work": "Tess of the d'Urbervilles", "author": 'Thomas Hardy', "year": 1891, "gutenberg_id": 110, "topic": 'courtship'},
    {"work": 'Daisy Miller', "author": 'Henry James', "year": 1878, "gutenberg_id": 208, "topic": 'courtship'},
    {"work": 'Villette', "author": 'Charlotte Bronte', "year": 1853, "gutenberg_id": 9182, "topic": 'courtship'},
    {"work": 'The Tenant of Wildfell Hall', "author": 'Anne Bronte', "year": 1848, "gutenberg_id": 969, "topic": 'courtship'},
    {"work": 'Agnes Grey', "author": 'Anne Bronte', "year": 1847, "gutenberg_id": 767, "topic": 'courtship'},
    {"work": "King Solomon's Mines", "author": 'H. Rider Haggard', "year": 1885, "gutenberg_id": 2166, "topic": 'travel'},
    {"work": 'Through the Looking-Glass', "author": 'Lewis Carroll', "year": 1871, "gutenberg_id": 12, "topic": 'childhood'},
    {"work": 'A Little Princess', "author": 'Frances Hodgson Burnett', "year": 1905, "gutenberg_id": 146, "topic": 'childhood'},
    {"work": 'What Katy Did', "author": 'Susan Coolidge', "year": 1872, "gutenberg_id": 8994, "topic": 'childhood'},
    {"work": 'Little Lord Fauntleroy', "author": 'Frances Hodgson Burnett', "year": 1886, "gutenberg_id": 479, "topic": 'childhood'},
    {"work": 'Heidi', "author": 'Johanna Spyri', "year": 1881, "gutenberg_id": 1448, "topic": 'childhood'},
    {"work": 'The House of the Seven Gables', "author": 'Nathaniel Hawthorne', "year": 1851, "gutenberg_id": 77, "topic": 'mourning'},
    {"work": 'The Mayor of Casterbridge', "author": 'Thomas Hardy', "year": 1886, "gutenberg_id": 143, "topic": 'mourning'},
    {"work": 'The Invisible Man', "author": 'H. G. Wells', "year": 1897, "gutenberg_id": 5230, "topic": 'invention'},
    {"work": 'The Island of Doctor Moreau', "author": 'H. G. Wells', "year": 1896, "gutenberg_id": 159, "topic": 'invention'},
    {"work": 'Adam Bede', "author": 'George Eliot', "year": 1859, "gutenberg_id": 507, "topic": 'rural'},
    {"work": 'The Return of the Native', "author": 'Thomas Hardy', "year": 1878, "gutenberg_id": 122, "topic": 'rural'},
    {"work": 'Rip Van Winkle', "author": 'Washington Irving', "year": 1819, "gutenberg_id": 60976, "topic": 'supernatural'},
    {"work": 'Carmilla', "author": 'Sheridan Le Fanu', "year": 1872, "gutenberg_id": 10007, "topic": 'supernatural'},
    {"work": 'The Age of Innocence', "author": 'Edith Wharton', "year": 1920, "gutenberg_id": 541, "topic": 'society'},
    {"work": 'Washington Square', "author": 'Henry James', "year": 1880, "gutenberg_id": 2870, "topic": 'society'},
    {"work": 'The Custom of the Country', "author": 'Edith Wharton', "year": 1913, "gutenberg_id": 11052, "topic": 'society'},
    {"work": 'Main Street', "author": 'Sinclair Lewis', "year": 1920, "gutenberg_id": 543, "topic": 'society'},
    {"work": 'Howards End', "author": 'E. M. Forster', "year": 1910, "gutenberg_id": 2891, "topic": 'society'},
    {"work": 'The Ghost Stories of an Antiquary', "author": 'M. R. James', "year": 1904, "gutenberg_id": 26779, "topic": 'supernatural'},]

def existing_excerpt_ids() -> set[str]:
    return {p.stem for p in OUT_DIR.glob("*.json")}


def existing_excerpt_texts() -> set[str]:
    texts = set()
    for p in OUT_DIR.glob("*.json"):
        try:
            doc = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        texts.add(doc.get("text", "").strip())
    return texts


def process_book(
    entry: dict,
    band: dict[str, int],
    glosses: dict[str, str],
    seen_ids: set[str],
    seen_texts: set[str],
    per_book_cap: int,
) -> list[dict]:
    """Fetch one book and emit its surviving excerpt records (not yet written)."""
    gid = entry["gutenberg_id"]
    try:
        raw = fetch_book(gid)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        print(f"  ! {entry['work']!r} (#{gid}): fetch failed — {e}", file=sys.stderr)
        return []

    body = strip_boilerplate(raw)
    start = find_body_start(body)
    body = strip_chapter_headings(body[start:])
    windows = windows_from_book(body)

    # Collect every surviving window first, then — if there are more than
    # the cap — take an evenly spaced sample across the whole book rather
    # than just the first `per_book_cap` encountered. A long novel's early
    # chapters do not carry its full vocabulary, and always harvesting from
    # the opening would silently bias the corpus toward exposition.
    candidates: list[tuple[str, list[tuple[str, list[str]]]]] = []
    for window in windows:
        if window in seen_texts:
            continue
        band_words = band_words_in(window, band)
        if not band_words:
            continue
        words = informative_words(window, band_words, glosses)
        if not words:
            continue
        candidates.append((window, words))

    if len(candidates) > per_book_cap:
        stride = len(candidates) / per_book_cap
        indices = [int(i * stride) for i in range(per_book_cap)]
        candidates = [candidates[i] for i in indices]

    slug_base = slugify(entry["work"])
    source_name, url = gutenberg_source_name(gid)
    records: list[dict] = []
    kept = 0
    for window, words in candidates:
        excerpt_id = f"src-gen-{slug_base}-{kept + 1:03d}"
        if excerpt_id in seen_ids:
            continue
        record = {
            "id": excerpt_id,
            "pool": "sourced",
            "text": window,
            "words": [{"word": w, "signals": signals} for w, signals in words],
            "provenance": {
                "work": entry["work"],
                "author": entry["author"],
                "year": entry["year"],
                "source": source_name,
                "url": url,
                "licence": PUBLIC_DOMAIN_BASIS,
                "retrieved": RETRIEVED,
            },
            "topic": entry["topic"],
        }
        records.append(record)
        seen_ids.add(excerpt_id)
        seen_texts.add(window)
        kept += 1
    return records


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit-books", type=int, default=None, help="only process the first N books (debugging)")
    parser.add_argument("--per-book-cap", type=int, default=40, help="max excerpts kept from any one book")
    parser.add_argument("--dry-run", action="store_true", help="report counts without writing files")
    args = parser.parse_args()

    band = load_frequency_band()
    glosses = load_glosses()
    if not glosses:
        print("warning: data/out/glosses.json not found — the gloss-overlap "
              "informativeness signal is disabled for this run (run "
              "data/pipeline/glosses.py first for the full heuristic)", file=sys.stderr)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    seen_ids = existing_excerpt_ids()
    seen_texts = existing_excerpt_texts()

    catalog = BOOK_CATALOG[: args.limit_books] if args.limit_books else BOOK_CATALOG
    total_written = 0
    total_windows_seen = 0
    per_topic: dict[str, int] = {}

    for i, entry in enumerate(catalog, start=1):
        print(f"[{i}/{len(catalog)}] {entry['work']} ({entry['author']}, {entry['year']}) — #{entry['gutenberg_id']}", file=sys.stderr)
        records = process_book(entry, band, glosses, seen_ids, seen_texts, args.per_book_cap)
        for record in records:
            per_topic[record["topic"]] = per_topic.get(record["topic"], 0) + 1
            if not args.dry_run:
                out_path = OUT_DIR / f"{record['id']}.json"
                out_path.write_text(
                    json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
                )
        total_written += len(records)
        print(f"    kept {len(records)} excerpts", file=sys.stderr)

    print(f"\n{total_written} excerpts {'would be ' if args.dry_run else ''}written across {len(catalog)} books.")
    print("by topic:")
    for topic, count in sorted(per_topic.items(), key=lambda kv: -kv[1]):
        print(f"  {topic}: {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
