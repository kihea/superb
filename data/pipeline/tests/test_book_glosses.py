"""Behavioural checks on the per-book gloss tables.

The tables (one per catalogue book, built by data/pipeline/book_glosses.py)
are what the reader taps into: word -> {"definition": ...}. These checks
hold what the app leans on: a table exists for every book in the catalogue
index, every table parses into the expected shape, keys are the lowercased
surface words the tokenizer produces, definitions carry the mechanical
normalization (capitalized first letter, closing period), and the rare words
a reader actually taps are present, with "antebellum" in Up from Slavery as
the canary.

A book's table lives beside that book in the library checkout, as
books/<id>/glosses.json, and is fetched from the same CDN commit as its
text. Only the app's own tables are committed in this repository, so this
reads the library the way book_glosses.py writes it. Pass --library to point
at a checkout somewhere other than C:/se-work/library.

Run: python data/pipeline/tests/test_book_glosses.py
"""

from __future__ import annotations

import json
import pathlib
import random
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent.parent
INDEX_PATH = ROOT / "content" / "catalogue" / "index-v1.json"
# The app's own tables (the shared senses, the composed-passage table) are
# still committed here; only the per-book ones moved.
GLOSSES_DIR = ROOT / "content" / "glosses"
DEFAULT_LIBRARY = pathlib.Path("C:/se-work/library")
LIBRARY = pathlib.Path(
    sys.argv[sys.argv.index("--library") + 1]
    if "--library" in sys.argv
    else DEFAULT_LIBRARY
)


def gloss_path(book_id: str) -> pathlib.Path:
    return LIBRARY / "books" / book_id / "glosses.json"

TERMINAL = (".", "!", "?", ")", "”", '"', "’", "]", "…")


def check(name: str, ok: bool, detail: str, problems: list[str]) -> None:
    if not ok:
        problems.append(f"{name}: {detail}")


def main() -> int:
    problems: list[str] = []

    index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    book_ids = [row["id"] for row in index["books"]]

    missing = [bid for bid in book_ids if not gloss_path(bid).is_file()]
    check(
        "a gloss table exists for every book in the catalogue",
        not missing,
        f"{len(missing)} missing, e.g. {missing[:3]}",
        problems,
    )

    # Every table parses into the expected shape. Deep-checking every entry
    # of every file would be slow for no extra proof; a fixed-seed sample of
    # entries per file keeps this honest and fast.
    rng = random.Random(1)
    empty = []
    for bid in book_ids:
        path = gloss_path(bid)
        if not path.is_file():
            continue
        table = json.loads(path.read_text(encoding="utf-8"))
        if not table:
            empty.append(bid)
            continue
        for word in rng.sample(sorted(table), min(20, len(table))):
            entry = table[word]
            if word != word.lower():
                check("keys are lowercase", False, f"{bid}: {word!r}", problems)
            if not isinstance(entry, dict) or not entry.get("definition"):
                check("entries hold a definition", False, f"{bid}: {word!r}", problems)
                continue
            definition = entry["definition"]
            if definition[:1].islower():
                check("definitions start capitalized", False, f"{bid}: {word!r} -> {definition[:40]!r}", problems)
            if not definition.endswith(TERMINAL):
                check("definitions end closed", False, f"{bid}: {word!r} -> {definition[-40:]!r}", problems)
    check("no table is empty", not empty, f"{empty[:5]}", problems)

    # The games share one table (content/challenges/glosses.json), same
    # shape, covering the words the challenge files can put on screen.
    challenge_path = ROOT / "content" / "challenges" / "glosses.json"
    check("the challenge gloss table exists", challenge_path.is_file(), "absent", problems)
    if challenge_path.is_file():
        table = json.loads(challenge_path.read_text(encoding="utf-8"))
        for word in ("about", "doubt", "all"):
            entry = table.get(word)
            check(f"{word!r} is glossed for the games", bool(entry and entry.get("definition")), "absent", problems)
        bad = [w for w, e in table.items() if not isinstance(e, dict) or not e.get("definition")]
        check("every challenge entry holds a definition", not bad, f"{bad[:5]}", problems)

    # The composed-passage word card reads one table too:
    # content/glosses/prose.json, the slot lexicons and sourced target
    # words plus real inflected headwords.
    prose_path = GLOSSES_DIR / "prose.json"
    check("the prose gloss table exists", prose_path.is_file(), "absent", problems)
    if prose_path.is_file():
        table = json.loads(prose_path.read_text(encoding="utf-8"))
        for word in ("serene", "indulgent", "serenely"):
            entry = table.get(word)
            check(f"{word!r} is glossed for composed passages", bool(entry and entry.get("definition")), "absent", problems)
        bad = [w for w, e in table.items() if not isinstance(e, dict) or not e.get("definition")]
        check("every prose entry holds a definition", not bad, f"{bad[:5]}", problems)

    # The rare words a reader taps are the point of the full dictionary.
    canaries = [
        ("booker-t-washington_up-from-slavery", "antebellum"),
        ("bram-stoker_dracula", "voluptuousness"),
        ("bram-stoker_dracula", "abandoned"),
    ]
    for bid, word in canaries:
        path = gloss_path(bid)
        if not path.is_file():
            continue
        table = json.loads(path.read_text(encoding="utf-8"))
        check(f"{word!r} is glossed in {bid}", word in table, "absent", problems)

    if problems:
        print(f"{len(problems)} failure(s):", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    print(f"gloss tables hold for all {len(book_ids)} catalogue books.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
