"""Holds content/challenges/rhyme-prompts.json and pronunciations.json to
the judging rules data/pipeline/rhymes.py states.

Checks the committed artifacts directly (no regeneration, no network): the
judge's rules are re-implemented here from the stored keys alone, exactly as
a client would, so a drift between what the generator writes and what a
client can derive fails here.

Run: python data/pipeline/tests/test_rhymes.py
"""

from __future__ import annotations

import json
import pathlib
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent.parent.parent
CHALLENGES = REPO_ROOT / "content" / "challenges"

VOWELS = set("AA AE AH AO AW AY EH ER EY IH IY OW OY UH UW".split())
NEAR_KINDS = {"same vowel", "same ending", "same final consonant"}


def ending_of(rime_key: str) -> str:
    parts = rime_key.split("-")
    last = max((i for i, p in enumerate(parts) if p in VOWELS), default=0)
    return "-".join(parts[last:])


def coda_of(rime_key: str) -> str:
    parts = rime_key.split("-")
    last = max((i for i, p in enumerate(parts) if p in VOWELS), default=0)
    return "-".join(parts[last + 1 :])


INFLECTION_TAILS = {"s", "es", "d", "ed", "r", "er", "st", "est", "ing", "n", "en"}


def same_stem(a: str, b: str) -> bool:
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


def judge(prons: dict, a: str, b: str) -> str | None:
    """'exact', 'near', or None — from stored keys only, like a client."""
    if a not in prons or b not in prons:
        return None
    if same_stem(a, b):
        return None
    rime_a, nucleus_a, _ = prons[a]
    rime_b, nucleus_b, _ = prons[b]
    if rime_a == rime_b:
        return "exact"
    if nucleus_a == nucleus_b:
        return "near"
    if ending_of(rime_a) == ending_of(rime_b):
        return "near"
    coda_a, coda_b = coda_of(rime_a), coda_of(rime_b)
    if coda_a and coda_a == coda_b:
        return "near"
    return None


def failures() -> list[str]:
    errors: list[str] = []
    prons = json.loads(
        (CHALLENGES / "pronunciations.json").read_text(encoding="utf-8")
    )
    doc = json.loads(
        (CHALLENGES / "rhyme-prompts.json").read_text(encoding="utf-8")
    )
    tiers = doc["tiers"]

    # The pairs the judging rules exist for.
    if prons["hollow"][0] != prons["follow"][0]:
        errors.append("hollow and follow do not share a rimeKey")
    if judge(prons, "hollow", "follow") != "exact":
        errors.append("hollow / follow should judge as an exact rhyme")
    if judge(prons, "hollow", "shadow") != "near":
        errors.append("hollow / shadow should judge as near, not exact")
    if judge(prons, "bat", "bit") != "near":
        errors.append("bat / bit should judge as near (same final consonant)")
    if judge(prons, "bake", "baked") is not None:
        errors.append("bake / baked share a stem and should not rhyme at all")

    # Every pronunciation row has the promised shape.
    for word, row in prons.items():
        if not (isinstance(row, list) and len(row) == 3):
            errors.append(f"pronunciations[{word!r}] is not [rime, nucleus, syllables]")
            break
        rime, nucleus, syllables = row
        if nucleus not in VOWELS or not isinstance(syllables, int):
            errors.append(f"pronunciations[{word!r}] = {row!r} is malformed")
            break

    # Tier structure: all seven present, each well-stocked.
    if sorted(tiers) != [str(n) for n in range(1, 8)]:
        errors.append(f"expected tiers 1-7, found {sorted(tiers)}")
    for tier, entries in tiers.items():
        if not 80 <= len(entries) <= 150:
            errors.append(f"tier {tier} has {len(entries)} prompts, outside 80-150")

    # Every prompt is playable and internally consistent.
    seen_prompts: set[str] = set()
    for tier, entries in tiers.items():
        for entry in entries:
            word = entry["word"]
            if word in seen_prompts:
                errors.append(f"prompt {word!r} appears in more than one tier")
            seen_prompts.add(word)
            if word not in prons:
                errors.append(f"prompt {word!r} missing from pronunciations.json")
                continue
            if len(entry["exact"]) < 8:
                errors.append(
                    f"prompt {word!r} lists only {len(entry['exact'])} exact rhymes"
                )
            for rhyme in entry["exact"]:
                if rhyme["kind"] != "exact":
                    errors.append(f"{word!r} exact list carries kind {rhyme['kind']!r}")
                verdict = judge(prons, word, rhyme["word"])
                if verdict != "exact":
                    errors.append(
                        f"{word!r} lists {rhyme['word']!r} as exact but the stored "
                        f"keys judge it {verdict!r}"
                    )
            for rhyme in entry["near"]:
                if rhyme["kind"] not in NEAR_KINDS:
                    errors.append(f"{word!r} near list carries kind {rhyme['kind']!r}")
                verdict = judge(prons, word, rhyme["word"])
                if verdict != "near":
                    errors.append(
                        f"{word!r} lists {rhyme['word']!r} as near but the stored "
                        f"keys judge it {verdict!r}"
                    )
    return errors


def main() -> int:
    errors = failures()
    for error in errors[:40]:
        print(f"FAIL: {error}", file=sys.stderr)
    if len(errors) > 40:
        print(f"... and {len(errors) - 40} more", file=sys.stderr)
    if errors:
        return 1
    doc = json.loads((CHALLENGES / "rhyme-prompts.json").read_text(encoding="utf-8"))
    prons = json.loads((CHALLENGES / "pronunciations.json").read_text(encoding="utf-8"))
    total = sum(len(v) for v in doc["tiers"].values())
    print(f"ok: {total} prompts across 7 tiers, {len(prons)} judgeable words")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
