"""Rhyme challenge data — writes content/challenges/rhyme-prompts.json and
content/challenges/pronunciations.json.

Source: the CMU Pronouncing Dictionary (CMUdict), fetched at a pinned commit
from the cmusphinx GitHub repository. Its licence is BSD 2-clause (free use
and redistribution with the copyright notice carried along) — the full text
is in data/NOTICE.md and the manifest row is in data/MANIFEST.md. The pypi
package named `cmudict` is NOT used: the data inside it is this same BSD
dictionary, but the package's own code is GPL-3.0, which this project bans.
Fetching the raw file at a pinned commit avoids the GPL wrapper entirely and
is just as reproducible.

How judging works, in one place so the app and this file can't drift:

  Every word gets a pronunciation (its first one, if CMUdict lists several).
  The vowel that matters is the last vowel with PRIMARY stress — falling
  back to secondary stress, then to the last vowel, when a word has none.
  (Secondary stress alone can't anchor a rhyme: "shadow" ends in a
  secondary-stressed OW, and counting that would make it an exact rhyme of
  "go".) From that vowel we derive:

    rimeKey     phonemes from that vowel to the end, stress digits stripped,
                joined with "-"           hollow -> "AA-L-OW"
    nucleusKey  just that vowel           hollow -> "AA"

  Exact rhyme   same rimeKey, different word stem (hollow / follow).
  Near rhyme    different rimeKey, but one of:
                  "same vowel"           same nucleusKey (hollow / bottle)
                  "same ending"          same tail from the LAST vowel inside
                                         the rimeKey (hollow / shadow — both
                                         end in the unstressed "OW")
                  "same final consonant" same non-empty phonemes after the
                                         last vowel (bat / bit share the "T")

  "Different word stem" is a light check: two words count as the same stem
  when one is a suffix of the other (light / delight), or when one is a
  plain inflection of the other (bake / baked, run / running). Same-stem
  pairs never rhyme at all — not exact, and not near either.

  Everything a client needs to judge a typed answer is derivable from
  pronunciations.json's [rimeKey, nucleusKey, syllableCount]: the ending and
  the final consonants both fall out of the rimeKey.

Prompts are drawn in seven frequency tiers (Zipf bands from wordfreq, tier 1
most common) and each must be playable: 1-3 syllables, plain lowercase
letters, and at least MIN_EXACT distinct exact rhymes worth showing. When a
base form qualifies, its plural/past/-ing forms are skipped so tiers don't
fill up with inflections of one word.

CMUdict is full of names, abbreviations and fragments ("bernardo", "vs"),
so prompts and the rhymes shown in the reveal are limited to words WordNet
knows, or very common words of three letters or more (which keeps "about"
and "then" while dropping "vs"). The judge itself still knows all 50,000
words — an answer outside the showable set is still judged fairly.

Deterministic: the dictionary is pinned to one commit, wordfreq is pinned in
requirements.txt, and every ordering ties off on the word itself.

Run: python data/pipeline/rhymes.py
"""

from __future__ import annotations

import json
import re
import sys
import urllib.request
from pathlib import Path

from wordfreq import zipf_frequency

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
OUT_DIR = REPO_ROOT / "content" / "challenges"
CACHE_DIR = REPO_ROOT / "data" / "cache"

CMUDICT_COMMIT = "74790861f652b15e4ac49015a90074ad62a27690"
CMUDICT_URL = (
    "https://raw.githubusercontent.com/cmusphinx/cmudict/"
    f"{CMUDICT_COMMIT}/cmudict.dict"
)

# How many words the client-side judge knows. Everything rarer than this is
# simply unjudgeable, which fails soft: the app can say it doesn't know the
# word rather than call it wrong.
JUDGE_WORDS = 50_000

# A prompt with fewer distinct exact rhymes than this is a trap, not a game.
MIN_EXACT = 8

# How many rhymes each prompt carries for the reveal.
EXACT_SHOWN = 12
NEAR_SHOWN = 8

# Per-tier prompt caps.
MIN_PER_TIER = 80
MAX_PER_TIER = 150

# Zipf bands, tier 1 (very common) to tier 7 (rare but real). Each tier takes
# words with band_low <= zipf, below the previous tier's floor.
TIER_FLOORS = [5.2, 4.7, 4.2, 3.8, 3.5, 3.2, 2.5]

# A word this common is showable even without a WordNet entry, if it is at
# least three letters ("about", "then"). Rarer than this, WordNet decides.
SHOWABLE_ZIPF = 5.0

WORD_RE = re.compile(r"[a-z]+$")


def ensure_wordnet() -> None:
    import nltk

    try:
        from nltk.corpus import wordnet

        wordnet.ensure_loaded()
    except LookupError:
        nltk.download("wordnet", quiet=True)


def fetch_cmudict() -> list[str]:
    """The pinned dictionary file, cached under data/cache/ after first run."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache = CACHE_DIR / f"cmudict-{CMUDICT_COMMIT[:12]}.dict"
    if not cache.exists():
        print(f"fetching {CMUDICT_URL}", file=sys.stderr)
        with urllib.request.urlopen(CMUDICT_URL) as response:
            cache.write_bytes(response.read())
    return cache.read_text(encoding="utf-8", errors="ignore").splitlines()


def parse(lines: list[str]) -> dict[str, list[str]]:
    """word -> its first pronunciation, for plain lowercase words only."""
    prons: dict[str, list[str]] = {}
    for line in lines:
        line = line.split(" #", 1)[0].strip()
        if not line:
            continue
        parts = line.split()
        word, phonemes = parts[0], parts[1:]
        if "(" in word:  # an alternate pronunciation of an earlier entry
            continue
        if not WORD_RE.match(word) or not phonemes:
            continue
        prons[word] = phonemes
    return prons


def is_vowel(phoneme: str) -> bool:
    return phoneme[-1].isdigit()


def strip_stress(phoneme: str) -> str:
    return phoneme[:-1] if is_vowel(phoneme) else phoneme


def analyze(phonemes: list[str]) -> tuple[str, str, int] | None:
    """[rimeKey, nucleusKey, syllableCount] for one pronunciation."""
    vowel_positions = [i for i, p in enumerate(phonemes) if is_vowel(p)]
    if not vowel_positions:
        return None
    primary = [i for i in vowel_positions if phonemes[i][-1] == "1"]
    secondary = [i for i in vowel_positions if phonemes[i][-1] == "2"]
    if primary:
        start = primary[-1]
    elif secondary:
        start = secondary[-1]
    else:
        start = vowel_positions[-1]
    rime = "-".join(strip_stress(p) for p in phonemes[start:])
    nucleus = strip_stress(phonemes[start])
    return rime, nucleus, len(vowel_positions)


def ending_of(rime_key: str) -> str:
    """The tail from the rimeKey's last vowel: 'AA-L-OW' -> 'OW'."""
    parts = rime_key.split("-")
    vowels = "AA AE AH AO AW AY EH ER EY IH IY OW OY UH UW".split()
    last = max((i for i, p in enumerate(parts) if p in vowels), default=0)
    return "-".join(parts[last:])


def coda_of(rime_key: str) -> str:
    """The consonants after the rimeKey's last vowel: 'AE-T' -> 'T'."""
    parts = rime_key.split("-")
    vowels = "AA AE AH AO AW AY EH ER EY IH IY OW OY UH UW".split()
    last = max((i for i, p in enumerate(parts) if p in vowels), default=0)
    return "-".join(parts[last + 1 :])


INFLECTION_TAILS = {"s", "es", "d", "ed", "r", "er", "st", "est", "ing", "n", "en"}


def same_stem(a: str, b: str) -> bool:
    """One word contains the other as its ending (light / delight), or one is
    a plain inflection of the other (bake / baked, run / running)."""
    if a.endswith(b) or b.endswith(a):
        return True
    short, long_ = (a, b) if len(a) < len(b) else (b, a)
    if long_.startswith(short):
        rest = long_[len(short):]
        if rest in INFLECTION_TAILS:
            return True
        if rest and rest[0] == short[-1] and rest[1:] in INFLECTION_TAILS:
            return True
    return False


def build() -> tuple[dict, dict]:
    prons = parse(fetch_cmudict())
    analyzed = {w: a for w, p in prons.items() if (a := analyze(p)) is not None}

    zipf = {w: zipf_frequency(w, "en", wordlist="best") for w in analyzed}
    known = sorted(
        (w for w in analyzed if zipf[w] > 0), key=lambda w: (-zipf[w], w)
    )[:JUDGE_WORDS]
    known_set = set(known)

    pronunciations = {
        w: list(analyzed[w]) for w in sorted(known_set)
    }

    ensure_wordnet()
    from nltk.corpus import wordnet

    def is_showable(w: str) -> bool:
        if zipf[w] >= SHOWABLE_ZIPF and len(w) >= 3:
            return True
        return bool(wordnet.synsets(w))

    showable = [w for w in known if is_showable(w)]

    by_rime: dict[str, list[str]] = {}
    by_nucleus: dict[str, list[str]] = {}
    by_ending: dict[str, list[str]] = {}
    by_coda: dict[str, list[str]] = {}
    for w in showable:  # already frequency-ordered, so groups stay ranked
        rime, nucleus, _ = analyzed[w]
        by_rime.setdefault(rime, []).append(w)
        by_nucleus.setdefault(nucleus, []).append(w)
        by_ending.setdefault(ending_of(rime), []).append(w)
        coda = coda_of(rime)
        if coda:
            by_coda.setdefault(coda, []).append(w)

    def exact_rhymes(word: str) -> list[str]:
        """Frequency-ranked exact rhymes, collapsed to distinct stems."""
        rime = analyzed[word][0]
        kept: list[str] = []
        for w in by_rime.get(rime, []):
            if same_stem(w, word):
                continue
            if any(same_stem(w, k) for k in kept):
                continue
            kept.append(w)
        return kept

    def near_rhymes(word: str) -> list[dict]:
        rime, nucleus, _ = analyzed[word]
        ending, coda = ending_of(rime), coda_of(rime)
        picked: list[dict] = []
        seen: set[str] = set()
        pools = [
            ("same vowel", by_nucleus.get(nucleus, [])),
            ("same ending", by_ending.get(ending, [])),
            ("same final consonant", by_coda.get(coda, []) if coda else []),
        ]
        # Round-robin by rank across the three pools keeps the list ranked by
        # frequency while still labelling each word with its strongest match.
        candidates: list[tuple[float, str, str]] = []
        for kind, pool in pools:
            for w in pool:
                candidates.append((-zipf[w], w, kind))
        for _, w, kind in sorted(candidates):
            if w in seen or w == word:
                continue
            seen.add(w)
            if analyzed[w][0] == rime or same_stem(w, word):
                continue
            picked.append({"word": w, "kind": kind})
            if len(picked) >= NEAR_SHOWN:
                break
        return picked

    # Which words qualify as prompts at all.
    qualifying: dict[str, list[str]] = {}
    for w in showable:
        if zipf[w] < TIER_FLOORS[-1] or len(w) < 3 or len(set(w)) < 2:
            continue
        if not 1 <= analyzed[w][2] <= 3:
            continue
        exacts = exact_rhymes(w)
        if len(exacts) >= MIN_EXACT:
            qualifying[w] = exacts

    # Skip inflections whose base form already qualifies.
    def base_forms(w: str) -> list[str]:
        bases = []
        for suffix in ("ing", "ed", "es", "d", "s"):
            if w.endswith(suffix) and len(w) - len(suffix) >= 3:
                stem = w[: -len(suffix)]
                bases.extend([stem, stem + "e"])
        if w.endswith("ied") and len(w) >= 5:
            bases.append(w[:-3] + "y")
        return bases

    prompts = [
        w for w in qualifying if not any(b in qualifying for b in base_forms(w))
    ]

    tiers: dict[str, list[dict]] = {}
    for tier_index, floor in enumerate(TIER_FLOORS, start=1):
        ceiling = TIER_FLOORS[tier_index - 2] if tier_index > 1 else 99.0
        in_band = sorted(
            (w for w in prompts if floor <= zipf[w] < ceiling),
            key=lambda w: (-zipf[w], w),
        )[:MAX_PER_TIER]
        if len(in_band) < MIN_PER_TIER:
            raise SystemExit(
                f"tier {tier_index} (Zipf {floor}-{ceiling}) has only "
                f"{len(in_band)} playable prompts; widen the band or lower "
                f"MIN_EXACT before shipping a starved tier."
            )
        tiers[str(tier_index)] = [
            {
                "word": w,
                "exact": [
                    {"word": r, "kind": "exact"}
                    for r in qualifying[w][:EXACT_SHOWN]
                ],
                "near": near_rhymes(w),
            }
            for w in sorted(in_band)
        ]

    prompts_doc = {
        "source": f"CMUdict, cmusphinx/cmudict commit {CMUDICT_COMMIT}",
        "note": (
            "Rhyme challenge prompts in seven tiers, tier 1 most common. "
            "Exact rhyme = same rimeKey in pronunciations.json with a "
            "different stem; near rhyme = same stressed vowel, same "
            "unstressed ending, or same final consonant. Generated by "
            "data/pipeline/rhymes.py. Do not hand-edit."
        ),
        "tiers": tiers,
    }
    return prompts_doc, pronunciations


def write(prompts_doc: dict, pronunciations: dict) -> list[Path]:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    prompts_path = OUT_DIR / "rhyme-prompts.json"
    prons_path = OUT_DIR / "pronunciations.json"
    prompts_path.write_text(
        json.dumps(prompts_doc, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )
    prons_path.write_text(
        json.dumps(pronunciations, ensure_ascii=False, separators=(",", ":"))
        + "\n",
        encoding="utf-8",
    )
    return [prompts_path, prons_path]


if __name__ == "__main__":
    prompts_doc, pronunciations = build()
    for path in write(prompts_doc, pronunciations):
        print(f"wrote {path}", file=sys.stderr)
    for tier, entries in prompts_doc["tiers"].items():
        print(f"tier {tier}: {len(entries)} prompts", file=sys.stderr)
    print(f"pronunciations: {len(pronunciations)} words", file=sys.stderr)
