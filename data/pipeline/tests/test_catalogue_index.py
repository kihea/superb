"""Behavioural checks on the committed catalogue index.

The index (content/catalogue/index-v1.json) is one row per book, built by
data/pipeline/catalogue_index.py from the library checkout. These checks
hold the properties the app leans on: every row parses and is complete, ids
are unique and resolve to real books on disk, and a handful of known books
carry the right first line, shape, translator and categories.

The on-disk checks need the library checkout (E:/se-work/library by
default; pass another path as the first argument). When it is absent the
internal checks still run and the disk checks are skipped with a note.

Run: python data/pipeline/tests/test_catalogue_index.py
"""

from __future__ import annotations

import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
INDEX_PATH = HERE.parent.parent.parent / "content" / "catalogue" / "index-v1.json"
DEFAULT_LIBRARY = pathlib.Path("E:/se-work/library")


def check(name: str, ok: bool, detail: str, problems: list[str]) -> None:
    if not ok:
        problems.append(f"{name}: {detail}")


def main() -> int:
    problems: list[str] = []

    index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    books = index["books"]
    rows = {row["id"]: row for row in books}

    check(
        "bookCount matches the number of rows",
        index["bookCount"] == len(books),
        f"bookCount {index['bookCount']} vs {len(books)} rows",
        problems,
    )
    check("ids are unique", len(rows) == len(books), "duplicate id present", problems)

    required = ("id", "title", "author", "language", "wordCount", "chapterCount", "chapterLabels", "categories", "shape")
    incomplete = [r["id"] for r in books if any(f not in r for f in required)]
    check("every row is complete", not incomplete, f"missing fields on {incomplete[:5]}", problems)

    bad_shape = [r["id"] for r in books if r["shape"] not in ("prose", "poetry", "drama", "mixed")]
    check("every shape is a known value", not bad_shape, f"{bad_shape[:5]}", problems)

    dracula = rows.get("bram-stoker_dracula")
    check("Dracula is on the shelf", dracula is not None, "row missing", problems)
    if dracula:
        check(
            "Dracula's first line is its actual opening",
            dracula.get("firstLine", "").startswith("3 May. Bistritz.\u2014Left Munich at 8:35"),
            f"got {dracula.get('firstLine')!r}",
            problems,
        )
        check("Dracula is prose", dracula["shape"] == "prose", dracula["shape"], problems)
        check(
            "Dracula's shelf category comes first",
            dracula["categories"][:1] == ["Fiction"],
            f"{dracula['categories'][:2]}",
            problems,
        )
        check("Dracula has no translator", "translator" not in dracula, dracula.get("translator", ""), problems)

    anna = rows.get("leo-tolstoy_anna-karenina_constance-garnett")
    if anna:
        check(
            "a part-wrapper first chapter is skipped for the first line",
            anna.get("firstLine", "").startswith("Happy families are all alike"),
            f"got {anna.get('firstLine')!r}",
            problems,
        )
        check(
            "the translator is read out of the edition's page URL",
            anna.get("translator") == "Constance Garnett",
            f"got {anna.get('translator')!r}",
            problems,
        )

    agamemnon = rows.get("aeschylus_agamemnon_gilbert-murray")
    if agamemnon:
        check("Agamemnon is drama", agamemnon["shape"] == "drama", agamemnon["shape"], problems)

    library = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_LIBRARY
    books_dir = library / "books"
    if books_dir.is_dir():
        on_disk = {p.name for p in books_dir.iterdir() if p.is_dir()}
        check(
            "one row per book on disk",
            len(books) == len(on_disk),
            f"{len(books)} rows vs {len(on_disk)} book directories",
            problems,
        )
        unresolved = [bid for bid in rows if not (books_dir / bid / "book.json").is_file()]
        check("every id resolves to a real book", not unresolved, f"{unresolved[:5]}", problems)
        disk_note = f"library at {library} checked"
    else:
        disk_note = f"library not present at {library}; on-disk checks skipped"

    if problems:
        print(f"{len(problems)} failure(s):", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    print(f"catalogue index holds for {len(books)} books ({disk_note}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
