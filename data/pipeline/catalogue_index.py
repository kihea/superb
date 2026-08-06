"""Catalogue index — writes content/catalogue/index-v1.json.

Source: the local library checkout (one directory per book, each holding
book.json and provenance.json, plus books/INDEX.json describing the shelf).
The library lives at C:/se-work/library on the build machine; pass a
different path as the first argument to read another checkout.

The index is one row per book: enough for the shelf and the book cover
screen (title, author, translator, categories, first line, size and shape),
and nothing more. The app fetches the full text of a book at runtime from

    https://cdn.jsdelivr.net/gh/superb-catalogue/library@main/books/<id>/book.json

so the index never carries body text — it stays a few MB and is committed.

What each field is:

- id            the book's directory name under books/
- title/author  straight from book.json
- translator    the third path segment of the Standard Ebooks page URL,
                turned back into a name ("constance-garnett" ->
                "Constance Garnett"). Only present when the edition has one.
                Single letters become initials ("h-t-lowe-porter" ->
                "H. T. Lowe Porter") — the URL cannot tell a hyphenated
                surname from a space, so a double-barrelled translator
                surname loses its hyphen here.
- language      from book.json (e.g. "en-GB")
- wordCount     counted from the text blocks with the same word pattern the
                app's reader uses (letter runs with internal apostrophes
                and hyphens)
- chapterCount  number of chapters in book.json
- chapterLabels the first few chapter labels, for a quick sense of how the
                book is divided (capped at 10; unlabeled chapters skipped)
- categories    the shelf's own category first (see the library's
                CATEGORIES.md), then the names of any collections the
                edition belongs to ("Also in" on the shelf)
- firstLine     the first substantial line of chapter 1, for the cover
                screen — headers and chapter-opening epigraphs are skipped,
                and a long opening paragraph is cut at a sentence boundary
- shape         "prose" | "poetry" | "drama" | "mixed", from the chapter
                type tags; a book is "mixed" only when no one shape covers
                at least 80% of its chapters
- description   would be a one-sentence description if the library carried
                one; no book in this checkout does, so the field is absent
                everywhere rather than invented

The output is minified (no indentation) because it is committed and fetched,
not read by people.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

DEFAULT_LIBRARY = Path("C:/se-work/library")
OUT_PATH = Path(__file__).resolve().parent.parent.parent / "content" / "catalogue" / "index-v1.json"

# Same shape as the reader's tokenizer (apps/web/src/content/render.ts):
# letter runs joined by internal apostrophes or hyphens.
WORD = re.compile(r"[A-Za-z]+(?:['\u2019-][A-Za-z]+)*")

# Chapter type tags that decide a chapter's shape.
DRAMA_TAGS = {"drama", "scene", "dramatis-personae"}
POETRY_TAGS = {"poem", "hymn", "song"}

# Blocks whose text is not the book's own first line.
SKIP_FOR_FIRST_LINE = {"header", "hgroup", "epigraph", "dedication", "figure", "table"}

# Chapters that are not the book's own text: a cast list, a dedication page.
SKIP_CHAPTERS_FOR_FIRST_LINE = {"dramatis-personae", "epigraph", "dedication", "halftitlepage"}

# Lowercase particles when turning a URL segment back into a person's name.
NAME_PARTICLES = {"de", "van", "von", "der", "la", "le", "du", "dos", "da", "al"}


def iter_texts(blocks: list) -> "iter[str]":
    """Every text string in a block tree, in reading order."""
    for block in blocks:
        text = block.get("text")
        if text:
            yield text
        children = block.get("blocks")
        if children:
            yield from iter_texts(children)


def count_words(chapters: list) -> int:
    total = 0
    for chapter in chapters:
        for text in iter_texts(chapter.get("blocks", [])):
            total += len(WORD.findall(text))
    return total


def clean_text(text: str) -> str:
    """Strip word-joiner artifacts and collapse whitespace for display."""
    text = text.replace("\ufeff", "").replace("\xa0", " ")
    return re.sub(r"\s+", " ", text).strip()


def first_line(chapters: list) -> str | None:
    """The first substantial line of the book's text, skipping headers and
    chapter-opening epigraphs. A first "chapter" is often just a part
    wrapper or a cast list with no prose of its own, so chapters are walked
    in order until one yields a line. Long paragraphs are cut at the first
    sentence boundary past 60 characters, and hard-capped at a word
    boundary."""
    candidates: list[str] = []

    def walk(blocks: list, skip: set) -> str | None:
        for block in blocks:
            base_types = set((block.get("type") or "").split("+"))
            if base_types & skip:
                continue
            text = block.get("text")
            if text:
                cleaned = clean_text(text)
                if len(cleaned) >= 40:
                    return cleaned
                if cleaned:
                    candidates.append(cleaned)
            children = block.get("blocks")
            if children:
                found = walk(children, skip)
                if found:
                    return found
        return None

    def scan(skip: set) -> str | None:
        for chapter in chapters:
            if set(chapter.get("types", [])) & SKIP_CHAPTERS_FOR_FIRST_LINE:
                continue
            found = walk(chapter.get("blocks", []), skip)
            if found:
                return found
        return None

    line = scan(SKIP_FOR_FIRST_LINE)
    if line is None:
        # A few books keep all their text inside tables (numbered
        # propositions, dialogue set as a table) — allow tables through
        # rather than leave the cover blank.
        line = scan({"header", "hgroup", "figure"})
    if line is None:
        # Nothing reached 40 characters (short verse lines, mottoes) — take
        # the first non-empty text rather than none at all.
        line = candidates[0] if candidates else None
    if line is None:
        return None
    if len(line) > 240:
        boundary = re.search(r"[.!?][\"')\u201d\u2019\]]*\s", line[60:240])
        if boundary:
            line = line[: 60 + boundary.end()].rstrip()
        else:
            line = line[:240].rsplit(" ", 1)[0].rstrip(",;:") + "\u2026"
    elif len(line) > 60:
        boundary = re.search(r"[.!?][\"')\u201d\u2019\]]*\s", line[60:])
        if boundary:
            line = line[: 60 + boundary.end()].rstrip()
    return line


def chapter_shape(types: list[str]) -> str:
    tags = set(types or [])
    if tags & DRAMA_TAGS:
        return "drama"
    if tags & POETRY_TAGS:
        return "poetry"
    return "prose"


def book_shape(chapters: list) -> str:
    counts: dict[str, int] = {}
    for chapter in chapters:
        shape = chapter_shape(chapter.get("types", []))
        counts[shape] = counts.get(shape, 0) + 1
    total = sum(counts.values())
    if not total:
        return "prose"
    top_shape, top_count = max(counts.items(), key=lambda item: item[1])
    if top_count / total >= 0.8:
        return top_shape
    return "mixed"


def translator_from_page_url(url: str) -> str | None:
    """Standard Ebooks page URLs are /ebooks/<author>/<title>[/<translator>].
    The third segment, when present, is the translator's name in URL form."""
    if "/ebooks/" not in url:
        return None
    segments = url.split("/ebooks/", 1)[1].strip("/").split("/")
    if len(segments) < 3:
        return None
    parts = []
    for word in segments[2].split("-"):
        if len(word) == 1:
            parts.append(word.upper() + ".")
        elif word in NAME_PARTICLES and parts:
            parts.append(word)
        else:
            parts.append(word.capitalize())
    return " ".join(parts)


def categories_for(provenance: dict) -> list[str]:
    result = []
    category = provenance.get("category")
    if category:
        result.append(category)
    for entry in provenance.get("sets", []):
        name = entry.get("name") if isinstance(entry, dict) else None
        if name and name not in result:
            result.append(name)
    return result


def build_row(book_id: str, book: dict, provenance: dict) -> dict:
    chapters = book.get("chapters", [])
    labels = [c["label"] for c in chapters if c.get("label")][:10]
    row = {
        "id": book_id,
        "title": book["title"],
        "author": book["author"],
        "language": book.get("language"),
        "wordCount": count_words(chapters),
        "chapterCount": len(chapters),
        "chapterLabels": labels,
        "categories": categories_for(provenance),
        "shape": book_shape(chapters),
    }
    translator = translator_from_page_url(provenance.get("identifier", ""))
    if translator:
        row["translator"] = translator
    opening = first_line(chapters)
    if opening:
        row["firstLine"] = opening
    # No description field: the library carries none, and inventing one is
    # worse than the cover screen doing without.
    return row


def build(library: Path) -> dict:
    books_dir = library / "books"
    rows = []
    for entry in sorted(books_dir.iterdir()):
        if not entry.is_dir():
            continue
        book = json.loads((entry / "book.json").read_text(encoding="utf-8"))
        provenance = json.loads((entry / "provenance.json").read_text(encoding="utf-8"))
        rows.append(build_row(entry.name, book, provenance))
    return {"version": 1, "bookCount": len(rows), "books": rows}


def validate(index: dict, library: Path) -> None:
    books_dir = library / "books"
    seen = set()
    for row in index["books"]:
        book_id = row["id"]
        if book_id in seen:
            raise SystemExit(f"duplicate id: {book_id}")
        seen.add(book_id)
        if not (books_dir / book_id / "book.json").is_file():
            raise SystemExit(f"id does not resolve to a book on disk: {book_id}")
        for field in ("title", "author", "wordCount", "chapterCount", "categories", "shape"):
            if field not in row:
                raise SystemExit(f"{book_id}: missing {field}")
        if row["shape"] not in ("prose", "poetry", "drama", "mixed"):
            raise SystemExit(f"{book_id}: bad shape {row['shape']}")
        if row["wordCount"] <= 0:
            raise SystemExit(f"{book_id}: empty word count")
    if index["bookCount"] != len(index["books"]):
        raise SystemExit("bookCount does not match the row count")


def write(index: dict) -> Path:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return OUT_PATH


if __name__ == "__main__":
    library = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_LIBRARY
    if not (library / "books").is_dir():
        raise SystemExit(f"no books directory under {library}")
    index = build(library)
    validate(index, library)
    # Round-trip through the serialized bytes so what is validated is what
    # is committed, not just the in-memory object.
    path = write(index)
    reparsed = json.loads(path.read_text(encoding="utf-8"))
    validate(reparsed, library)
    size_mb = path.stat().st_size / 1_000_000
    print(f"wrote {path} ({reparsed['bookCount']} books, {size_mb:.1f} MB)")
