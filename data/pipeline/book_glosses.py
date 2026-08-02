"""Per-book gloss tables — writes content/glosses/<book-id>.json for every
book in the library.

Source: the same English-language Wiktionary extract glosses.py streams
(wiktextract by Tatu Ylonen, code MIT; text CC BY-SA 4.0 / GFDL — see
data/NOTICE.md and honour the attribution wherever a gloss reaches a
reader). At this scale the extract is downloaded once to
E:/se-work/kaikki/kaikki-english.jsonl (~3 GB) instead of being re-streamed
per run; E:/se-work/kaikki/retrieved.txt records the download date
(2026-08-02 for the current build).

Two stages, run as subcommands:

  python data/pipeline/book_glosses.py dict
      Read the local extract once and build a word -> definition store at
      E:/se-work/kaikki/dict.sqlite. Same filtering rules as glosses.py —
      content parts of speech only (noun/verb/adj/adv), form-of/alt-of
      senses redirect to their lemma and the first substantive gloss wins —
      but with NO frequency band: every lowercase alphabetic English entry
      (internal apostrophes and hyphens allowed) with a substantive gloss
      goes in. Rare words are exactly what a reader taps on. Definitions
      are normalized the way the first Dracula table was: capitalized
      first letter, closing period.

  python data/pipeline/book_glosses.py books [book-id ...]
      For each book in the library (all of them when no ids are given),
      tokenize the text with the same word pattern the app's reader uses
      (letter runs with internal apostrophes/hyphens, lowercased), look up
      every distinct word, and write content/glosses/<book-id>.json in the
      shape the app already reads: {"word": {"definition": "..."}},
      minified. A word found nowhere stays absent — the app says so
      honestly rather than inventing a meaning.

  python data/pipeline/book_glosses.py prose
      One table for the composed-passage word card: every slot-lexicon
      member (content/classes/*.json) and every target word in the sourced
      excerpts (content/sources/*.json, words[].word), plus their common
      inflections — an inflected form is added only when it is a real
      dictionary headword itself, never invented. Written to
      content/glosses/prose.json, same shape as a book table.

  python data/pipeline/book_glosses.py challenges
      One table for the games: every word that appears anywhere in
      content/challenges/rhyme-prompts.json (prompts and reveal words) and
      content/challenges/association.json (prompts and associates), looked
      up with the same rules, written to content/challenges/glosses.json
      in the same shape as a book table.

Lookups, in order, for a word the store does not hold directly:
  - apostrophes: the book prints curly quotes, the dictionary straight
    ones, so lookups normalize; the JSON key keeps the curly form because
    that is the exact string the app looks up after tokenizing
  - possessives: "night's" -> "night"
  - hyphens: "to-day" -> "today" (the joined form); the parts of a
    hyphenated word are also glossed as their own words
  - plain inflections: -s/-es/-ed/-ing/-ly stripped with the standard
    doubled-consonant and silent-e heuristics ("stopped" -> "stop",
    "making" -> "make"). Most inflected forms are already headwords in the
    extract and redirect to their lemma, so this is a fallback, not the
    main path.

The library checkout is read from E:/se-work/library (pass --library to
point elsewhere). The app fetches the book text itself at runtime from
https://cdn.jsdelivr.net/gh/superb-catalogue/library@main/books/<id>/book.json;
these tables are the only per-book content this repository commits.
"""

from __future__ import annotations

import json
import re
import sqlite3
import sys
from pathlib import Path

import glosses as gl

KAIKKI_DIR = Path("E:/se-work/kaikki")
JSONL_PATH = KAIKKI_DIR / "kaikki-english.jsonl"
DICT_PATH = KAIKKI_DIR / "dict.sqlite"
DEFAULT_LIBRARY = Path("E:/se-work/library")
OUT_DIR = Path(__file__).resolve().parent.parent.parent / "content" / "glosses"

# Same shape as the reader's tokenizer (apps/web/src/content/render.ts).
WORD = re.compile(r"[A-Za-z]+(?:['\u2019-][A-Za-z]+)*")

# A dictionary headword this store accepts: lowercase letters, with
# internal apostrophes or hyphens ("o'clock", "well-being").
HEADWORD = re.compile(r"^[a-z]+(?:['-][a-z]+)*$")

TERMINAL = (".", "!", "?", ")", "\u201d", '"', "\u2019", "]", "\u2026")


def normalize_definition(gloss: str) -> str:
    """The mechanical cleanup the first Dracula table applied: capitalized
    first letter, closing period. Nothing semantic."""
    text = gloss.strip()
    if text and text[0].islower():
        text = text[0].upper() + text[1:]
    if text and not text.endswith(TERMINAL):
        text = text.rstrip(",;:") + "."
    return text


def build_dictionary() -> None:
    """One pass over the local extract, applying glosses.py's rules to
    every acceptable headword instead of a frequency band."""
    if not JSONL_PATH.exists():
        raise SystemExit(f"{JSONL_PATH} not found — download the extract first (see the docstring)")

    result: dict[str, str] = {}
    redirect: dict[str, str] = {}
    lines = 0
    with JSONL_PATH.open("r", encoding="utf-8", errors="ignore") as source:
        for line in source:
            lines += 1
            if lines % 500_000 == 0:
                print(f"  {lines:,} lines, {len(result):,} glosses, {len(redirect):,} redirects", file=sys.stderr)
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if entry.get("lang_code") != "en":
                continue
            word = entry.get("word", "")
            if word in redirect or not HEADWORD.match(word):
                continue
            if entry.get("pos") not in gl.CONTENT_POS:
                continue
            # Per-entry first-signal rule, exactly as glosses.py.build():
            # within one entry the first sense that is either a redirect or
            # a substantive gloss decides that entry's contribution, and a
            # redirect found in any entry overrides a gloss set by another
            # entry for the same spelling.
            entry_redirect = None
            entry_gloss = None
            for sense in entry.get("senses", []):
                tags = sense.get("tags", [])
                target = gl.redirect_target(sense, tags)
                if target:
                    entry_redirect = target
                    break
                gloss = gl.best_gloss(None, tags, sense.get("glosses", []))
                if gloss is not None:
                    entry_gloss = gloss
                    break
            if entry_redirect:
                redirect.setdefault(word, entry_redirect)
                continue
            if entry_gloss is not None and result.get(word) is None:
                result[word] = entry_gloss

    for surface, lemma in redirect.items():
        result.pop(surface, None)
        resolved = gl.resolve_redirect(lemma, result, redirect)
        if resolved is not None:
            result[surface] = resolved

    DICT_PATH.parent.mkdir(parents=True, exist_ok=True)
    if DICT_PATH.exists():
        DICT_PATH.unlink()
    db = sqlite3.connect(DICT_PATH)
    db.execute("CREATE TABLE gloss (word TEXT PRIMARY KEY, definition TEXT NOT NULL)")
    db.executemany(
        "INSERT INTO gloss VALUES (?, ?)",
        ((word, normalize_definition(text)) for word, text in sorted(result.items())),
    )
    db.commit()
    db.close()
    print(f"wrote {DICT_PATH} ({len(result):,} words from {lines:,} extract lines)")


def load_dictionary() -> dict[str, str]:
    if not DICT_PATH.exists():
        raise SystemExit(f"{DICT_PATH} not found — run `python data/pipeline/book_glosses.py dict` first")
    db = sqlite3.connect(DICT_PATH)
    table = dict(db.execute("SELECT word, definition FROM gloss"))
    db.close()
    return table


def iter_texts(blocks: list):
    for block in blocks:
        text = block.get("text")
        if text:
            yield text
        children = block.get("blocks")
        if children:
            yield from iter_texts(children)


def book_words(book: dict) -> set[str]:
    """Every distinct word a reader could tap: the tokens themselves, plus
    the parts of hyphenated tokens (each part is a word in its own right)."""
    words: set[str] = set()
    for chapter in book.get("chapters", []):
        for text in iter_texts(chapter.get("blocks", [])):
            for token in WORD.findall(text):
                token = token.lower()
                words.add(token)
                if "-" in token:
                    words.update(part for part in token.split("-") if part)
    return words


def stripped_forms(word: str) -> list[str]:
    """Plain inflection candidates, most specific first. Only obvious
    endings: s/es/ed/ing/ly, with the standard doubled-consonant and
    silent-e heuristics."""
    forms: list[str] = []

    def add(candidate: str) -> None:
        if len(candidate) >= 2 and candidate not in forms:
            forms.append(candidate)

    if word.endswith("ies") and len(word) > 4:
        add(word[:-3] + "y")
    if word.endswith("ied") and len(word) > 4:
        add(word[:-3] + "y")
    if word.endswith("ily") and len(word) > 4:
        add(word[:-3] + "y")
    if word.endswith("ing") and len(word) > 4:
        if len(word) > 5 and word[-4] == word[-5]:
            add(word[:-4])  # running -> run
        add(word[:-3] + "e")  # making -> make, before walking -> walk:
        add(word[:-3])        # the silent-e restore first, so "caring"
                              # finds "care" and never settles for "car"
    if word.endswith("ed") and len(word) > 3:
        if len(word) > 4 and word[-3] == word[-4]:
            add(word[:-3])  # stopped -> stop
        add(word[:-1])      # hoped -> hope, before walked -> walk,
        add(word[:-2])      # for the same silent-e reason
    if word.endswith("ly") and len(word) > 3:
        add(word[:-2])
    if word.endswith("es") and len(word) > 3:
        add(word[:-2])
    if word.endswith("s") and len(word) > 2 and not word.endswith("ss"):
        add(word[:-1])
    return forms


def find_definition(word: str, table: dict[str, str]) -> str | None:
    """`word` is the surface token, lowercased, curly apostrophes intact."""
    plain = word.replace("\u2019", "'")
    found = table.get(plain)
    if found:
        return found
    if plain.endswith("'s"):
        base = plain[:-2]
        found = table.get(base)
        if found:
            return found
        plain = base  # let inflection stripping see the bare word
    if "-" in plain:
        found = table.get(plain.replace("-", ""))
        if found:
            return found
    for form in stripped_forms(plain):
        found = table.get(form)
        if found:
            return found
    return None


def write_book_table(book_id: str, library: Path, table: dict[str, str]) -> tuple[int, int]:
    book = json.loads((library / "books" / book_id / "book.json").read_text(encoding="utf-8"))
    words = book_words(book)
    entries = {}
    for word in sorted(words):
        definition = find_definition(word, table)
        if definition:
            entries[word] = {"definition": definition}
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"{book_id}.json"
    with out_path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(entries, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
    return len(entries), len(words)


def write_all_books(library: Path, only: list[str]) -> None:
    table = load_dictionary()
    books_dir = library / "books"
    book_ids = only or sorted(p.name for p in books_dir.iterdir() if p.is_dir())
    glossed_total = 0
    distinct_total = 0
    for n, book_id in enumerate(book_ids, 1):
        glossed, distinct = write_book_table(book_id, library, table)
        glossed_total += glossed
        distinct_total += distinct
        if n % 50 == 0 or n == len(book_ids):
            print(f"  {n}/{len(book_ids)} books", file=sys.stderr)
    size = sum(f.stat().st_size for f in OUT_DIR.glob("*.json"))
    coverage = 100 * glossed_total / distinct_total if distinct_total else 0
    print(
        f"wrote {len(book_ids)} gloss tables to {OUT_DIR} "
        f"({size / 1_000_000:.0f} MB total, {coverage:.0f}% of distinct words glossed)"
    )


def collect_words(node) -> set[str]:
    """Every value of a "word" key, anywhere in a challenge file: the
    prompts, the rhyme reveal words, the associates."""
    words: set[str] = set()
    if isinstance(node, dict):
        value = node.get("word")
        if isinstance(value, str):
            words.add(value.lower())
        for child in node.values():
            words |= collect_words(child)
    elif isinstance(node, list):
        for child in node:
            words |= collect_words(child)
    return words


def write_challenge_table() -> None:
    table = load_dictionary()
    challenges_dir = OUT_DIR.parent / "challenges"
    words: set[str] = set()
    for name in ("rhyme-prompts.json", "association.json"):
        data = json.loads((challenges_dir / name).read_text(encoding="utf-8"))
        words |= collect_words(data)
    entries = {}
    for word in sorted(words):
        definition = find_definition(word, table)
        if definition:
            entries[word] = {"definition": definition}
    out_path = challenges_dir / "glosses.json"
    with out_path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(entries, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
    print(f"wrote {out_path} ({len(entries)} of {len(words)} challenge words glossed)")


def inflected_headwords(word: str, table: dict[str, str]) -> list[str]:
    """Regularly-formed inflections of `word` that are real dictionary
    headwords. Candidates are generated with the mirror of the stripping
    heuristics (plural, past, participle, adverb, silent-e and y-to-i
    forms) and kept only when the dictionary itself holds them, so no
    invented form ever becomes a key."""
    candidates = {word + "s", word + "es", word + "ed", word + "ing", word + "ly"}
    if word.endswith("e"):
        candidates.update({word + "d", word[:-1] + "ing"})
    if word.endswith("y") and len(word) > 2:
        stem = word[:-1]
        candidates.update({stem + "ies", stem + "ied", stem + "ily", stem + "ier", stem + "iest"})
    if len(word) > 2 and word[-1] not in "aeiouwxy" and word[-2] in "aeiou" and word[-3] not in "aeiou":
        doubled = word + word[-1]
        candidates.update({doubled + "ed", doubled + "ing"})
    return [form for form in sorted(candidates) if form in table]


def write_prose_table() -> None:
    table = load_dictionary()
    root = OUT_DIR.parent
    words: set[str] = set()
    for path in sorted((root / "classes").glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        words.update(member.lower() for member in data.get("members", []))
    for path in sorted((root / "sources").glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        words.update(row["word"].lower() for row in data.get("words", []) if row.get("word"))
    entries = {}
    for word in sorted(words):
        definition = find_definition(word, table)
        if definition:
            entries[word] = {"definition": definition}
        for form in inflected_headwords(word.replace("’", "'"), table):
            entries.setdefault(form, {"definition": table[form]})
    out_path = OUT_DIR / "prose.json"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(dict(sorted(entries.items())), handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
    print(f"wrote {out_path} ({len(entries)} entries from {len(words)} base words)")


if __name__ == "__main__":
    args = sys.argv[1:]
    library = DEFAULT_LIBRARY
    if "--library" in args:
        at = args.index("--library")
        library = Path(args[at + 1])
        del args[at : at + 2]
    command = args[0] if args else ""
    if command == "dict":
        build_dictionary()
    elif command == "books":
        write_all_books(library, args[1:])
    elif command == "challenges":
        write_challenge_table()
    elif command == "prose":
        write_prose_table()
    else:
        raise SystemExit("usage: book_glosses.py [--library PATH] dict | books [book-id ...] | challenges | prose")
