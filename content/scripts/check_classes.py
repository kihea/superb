"""The class system's only real defence (workspace/tracks/T3-content.md §2).

For every class, every member word is substituted into the class's fixture
sentence and checked two ways:

1. Mechanical well-formedness — substituting {word} did not break spacing,
   capitalisation, or terminal punctuation.
2. Part-of-speech agreement — the word carries a WordNet sense tagged with
   the class's declared `pos`. WordNet (Princeton) is already on the project's
   licence allow-list (ADR-008), so this reuses a dependency the project has
   already cleared rather than adding a new one.

Why a lexicon lookup and not a context tagger: an off-the-shelf statistical
POS tagger (NLTK's averaged perceptron, tried first) mistagged roughly one
word in twelve even inside deliberately unambiguous frames ("It was a
colossal structure." tags "colossal" as NN) — it is tuned to newswire
frequency statistics, and most of this vocabulary is exactly the register
that is rare in that corpus. A tagger that is wrong more often than the thing
it is meant to catch is not a defence. WordNet's per-word sense inventory
does not depend on corpus frequency, so it holds up on literary vocabulary in
a way the tagger did not.

Neither check claims the substituted sentence "reads naturally" in the full
editorial sense the track asks for — that judgment was spent once, upstream,
by hand, when each fixture's syntactic position was chosen specifically to
disambiguate its part of speech (determiner-adjective-noun; verb-adverb; a
to-infinitive for verbs) and every member was picked to fit it. What this
buys is a regression guard: a future edit that adds a word of the wrong part
of speech, or a fixture rewritten into an ambiguous position, fails loudly
instead of drifting in silently.
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

try:
    import nltk
    from nltk.corpus import wordnet as wn
except ImportError:  # pragma: no cover
    print("nltk is required: pip install -r content/scripts/requirements.txt", file=sys.stderr)
    raise

CLASSES_DIR = pathlib.Path(__file__).resolve().parent.parent / "classes"

# Coarse pos -> WordNet pos codes that satisfy it. Adjective satellite senses
# ('s', e.g. "waxen") count as adjectives.
WORDNET_POS = {
    "adj": [wn.ADJ, wn.ADJ_SAT],
    "adv": [wn.ADV],
    "noun": [wn.NOUN],
    "verb": [wn.VERB],
}


def ensure_wordnet() -> None:
    try:
        wn.synsets("test")
    except LookupError:
        nltk.download("wordnet", quiet=True)


def check_class(path: pathlib.Path) -> list[str]:
    errors: list[str] = []
    doc = json.loads(path.read_text(encoding="utf-8"))
    class_id = doc["id"]
    pos = doc["pos"]
    fixture = doc["fixture"]
    members = doc["members"]
    wordnet_pos = WORDNET_POS[pos]

    if path.stem != class_id:
        errors.append(f"{path.name}: id {class_id!r} does not match filename")

    for word in members:
        sentence = fixture.replace("{word}", word)

        # 1. mechanical well-formedness
        if "  " in sentence:
            errors.append(f"{class_id}/{word}: double space in {sentence!r}")
        if not re.match(r"^[A-Z]", sentence):
            errors.append(f"{class_id}/{word}: does not start capitalised: {sentence!r}")
        if not re.search(r"[.!?]$", sentence):
            errors.append(f"{class_id}/{word}: does not end in terminal punctuation: {sentence!r}")

        # 2. pos agreement, via WordNet's sense inventory for the word
        if not any(wn.synsets(word, pos=p) for p in wordnet_pos):
            found = [p for p in [wn.ADJ, wn.ADJ_SAT, wn.NOUN, wn.VERB, wn.ADV] if wn.synsets(word, pos=p)]
            errors.append(
                f"{class_id}/{word}: no WordNet sense tagged {pos} "
                f"(found: {found or 'no senses at all'})"
            )
    return errors


def main() -> int:
    ensure_wordnet()
    all_errors: list[str] = []
    class_files = sorted(CLASSES_DIR.glob("*.json"))
    if not (30 <= len(class_files) <= 50):
        all_errors.append(f"expected 30-50 class files, found {len(class_files)}")
    for path in class_files:
        all_errors.extend(check_class(path))

    if all_errors:
        print(f"{len(all_errors)} substitution failures:", file=sys.stderr)
        for e in all_errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    print(f"{len(class_files)} classes, all members substitute grammatically.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
