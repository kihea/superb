"""Holds content/challenges/association.json and association-index.json to
what data/pipeline/associations.py promises.

Checks the committed artifacts directly (no regeneration): tier stocking,
the fixed label set, the shape of every associate, and agreement between
the reveal file and the judge's index — plus a few concrete pairs a person
would expect an association game to know.

Run: python data/pipeline/tests/test_associations.py
"""

from __future__ import annotations

import json
import pathlib
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent.parent.parent
CHALLENGES = REPO_ROOT / "content" / "challenges"

ALLOWED_LABELS = {
    "means the same",
    "opposite",
    "a kind of it",
    "it is a kind of",
    "part of it",
    "made from it",
    "shows up beside it",
    "comes from the same root",
}


def failures() -> list[str]:
    errors: list[str] = []
    doc = json.loads((CHALLENGES / "association.json").read_text(encoding="utf-8"))
    index = json.loads(
        (CHALLENGES / "association-index.json").read_text(encoding="utf-8")
    )
    tiers = doc["tiers"]
    prompts = index["prompts"]
    prompt_position = {w: i for i, w in enumerate(prompts)}
    answers = index["answers"]

    def connects(answer: str, prompt: str) -> bool:
        return prompt_position.get(prompt) in set(answers.get(answer, []))

    # Pairs a person would expect. forge's smithy sense must reach its
    # anvil/iron/metal neighbourhood one way or another.
    if not any(connects(w, "forge") for w in ("anvil", "iron", "metal", "smithy")):
        errors.append("forge does not connect to anvil, iron, metal or smithy")
    if not connects("queen", "king"):
        errors.append("queen does not answer king")

    # Tier structure.
    if sorted(tiers) != [str(n) for n in range(1, 8)]:
        errors.append(f"expected tiers 1-7, found {sorted(tiers)}")
    for tier, entries in tiers.items():
        if not 80 <= len(entries) <= 150:
            errors.append(f"tier {tier} has {len(entries)} prompts, outside 80-150")

    # Every prompt is well-formed and agrees with the index.
    seen: set[str] = set()
    for tier, entries in tiers.items():
        for entry in entries:
            word = entry["word"]
            if word in seen:
                errors.append(f"prompt {word!r} appears in more than one tier")
            seen.add(word)
            if word not in prompt_position:
                errors.append(f"prompt {word!r} missing from the index's prompt list")
                continue
            associates = entry["associates"]
            if not 10 <= len(associates) <= 20:
                errors.append(
                    f"prompt {word!r} carries {len(associates)} associates, "
                    f"outside 10-20"
                )
            for associate in associates:
                if associate["word"] == word:
                    errors.append(f"prompt {word!r} lists itself as an associate")
                if associate["connection"] not in ALLOWED_LABELS:
                    errors.append(
                        f"prompt {word!r} associate {associate['word']!r} carries "
                        f"label {associate['connection']!r}, not in the fixed set"
                    )
                if not (associate["wn"] or associate["pmi"]):
                    errors.append(
                        f"prompt {word!r} associate {associate['word']!r} has "
                        f"neither source flag set"
                    )
                if associate["connection"] == "shows up beside it" and associate["wn"]:
                    errors.append(
                        f"prompt {word!r} associate {associate['word']!r} is "
                        f"corpus-labelled but claims a WordNet source"
                    )
                if not connects(associate["word"], word):
                    errors.append(
                        f"the reveal lists {associate['word']!r} for {word!r} but "
                        f"the index would not accept it"
                    )

    if sorted(seen) != prompts:
        errors.append(
            "index prompt list is not exactly the sorted set of tier prompts"
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
    doc = json.loads((CHALLENGES / "association.json").read_text(encoding="utf-8"))
    index = json.loads(
        (CHALLENGES / "association-index.json").read_text(encoding="utf-8")
    )
    total = sum(len(v) for v in doc["tiers"].values())
    print(
        f"ok: {total} prompts across 7 tiers, "
        f"{len(index['answers'])} judgeable answer words"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
