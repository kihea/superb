"""Multi-sense dictionary — writes E:/se-work/kaikki/senses.sqlite.

Source: the same local wiktextract extract book_glosses.py reads
(E:/se-work/kaikki/kaikki-english.jsonl, ~3 GB; text CC BY-SA 4.0 / GFDL,
attribution in data/NOTICE.md). One pass, no network.

Where glosses.py and book_glosses.py keep ONE definition per word, this
stage keeps every content part of speech a word has, so a reader-facing
card can pick the sense the sentence actually uses:

    senses:  word -> JSON [{"pos": "verb", "def": "..."}, ...]
    roots:   word -> JSON [["Latin", "struere"], ...]   (etymology roots)

Rules carried over from book_glosses.py, restated per part of speech:
  - content POS only (noun / verb / adj / adv)
  - within one entry the first sense that is either a form-of/alt-of
    redirect or a substantive gloss decides that entry's contribution
  - a redirect resolves to its lemma's glosses *of the redirecting
    entry's own POS* — "sounded" is a verb form of "sound", so it gets
    sound's verb senses, never the adjective "healthy"
  - a redirect's gloss is prefixed with the form relation ("Form of
    sound: ...") so the card can say what the reader actually tapped

Definition ordering (which sense is the default when no context helps)
is NOT decided here — the table writers in book_glosses.py order by
WordNet part-of-speech weight at build time. This stage only collects.

Run: python data/pipeline/senses.py
"""

from __future__ import annotations

import json
import re
import sqlite3
import sys
from pathlib import Path

KAIKKI_DIR = Path("E:/se-work/kaikki")
JSONL_PATH = KAIKKI_DIR / "kaikki-english.jsonl"
OUT_PATH = KAIKKI_DIR / "senses.sqlite"

CONTENT_POS = {"noun", "verb", "adj", "adv"}
SKIP_TAGS = {"alt-of", "abbreviation", "form-of"}
HEADWORD = re.compile(r"^[a-z]+(?:['-][a-z]+)*$")

# At most this many glosses kept per entry, per (word, pos), and per word.
PER_ENTRY = 2
PER_POS = 3
PER_WORD = 9
GLOSS_CAP = 220

# "from Latin struere", "from Old English cnāwan", "from Proto-Germanic
# *knēaną" — language name(s) then the root token. The root keeps letters
# beyond ASCII (macrons, asterisk reconstructions).
ROOT_RE = re.compile(
    r"[Ff]rom\s+((?:Proto-)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+"
    r"([*]?[a-zA-Z\u00c0-\u024f\u1e00-\u1eff-]{3,})"
)
# Words that follow "from" but are not language names.
NOT_LANGUAGES = {
    "Ellipsis", "Clipping", "Abbreviation", "Compound", "Uncertain",
    "Unknown", "Univerbation", "Back-formation", "Blend", "Borrowed",
    "Doublet", "Verbal", "Displaced", "Cognate", "Compare", "See",
}


def first_signal(entry: dict) -> tuple[list[str], tuple[str, list[str]] | None]:
    """(glosses, redirect) — at most one is non-empty. Within one entry the
    first sense with either signal decides which kind the entry is (the
    same first-signal rule glosses.py.build() states); a gloss entry then
    contributes up to PER_ENTRY substantive glosses so a word like "dear"
    keeps both "beloved" and "high in price" rather than only whichever
    the snapshot lists first."""
    glosses: list[str] = []
    for sense in entry.get("senses", []):
        tags = sense.get("tags", [])
        refs = None
        if "form-of" in tags:
            refs = sense.get("form_of") or []
        elif "alt-of" in tags:
            refs = sense.get("alt_of") or []
        if refs is not None:
            if glosses:
                break  # a redirect deeper in a gloss entry never hijacks it
            for ref in refs:
                target = ref.get("word") if isinstance(ref, dict) else None
                if target:
                    return [], (target, tags)
            return [], None
        if any(tag in SKIP_TAGS for tag in tags):
            continue
        text = (sense.get("glosses") or [""])[0].strip()
        if text and text[:GLOSS_CAP] not in glosses:
            glosses.append(text[:GLOSS_CAP])
            if len(glosses) >= PER_ENTRY:
                break
    return glosses, None


def extract_roots(entry: dict) -> list[tuple[str, str]]:
    text = entry.get("etymology_text") or ""
    if not text:
        return []
    roots: list[tuple[str, str]] = []
    for lang, root in ROOT_RE.findall(text[:600]):
        if lang.split()[0] in NOT_LANGUAGES:
            continue
        root = root.rstrip("-")
        if len(root) >= 3:
            roots.append((lang, root.lower()))
        if len(roots) >= 4:
            break
    return roots


def build_pos_weights(senses: dict) -> dict[str, dict[str, int]]:
    """word -> {pos: WordNet synset count}. Sort stays stable (encounter
    order) for any word WordNet does not know, and for ties."""
    try:
        import nltk

        try:
            from nltk.corpus import wordnet

            wordnet.ensure_loaded()
        except LookupError:
            nltk.download("wordnet", quiet=True)
            from nltk.corpus import wordnet
    except Exception:
        print("  (WordNet unavailable — keeping encounter order)", file=sys.stderr)
        return {}

    wn_pos = {"noun": "n", "verb": "v", "adj": "a", "adv": "r"}
    weights: dict[str, dict[str, int]] = {}
    for word, rows in senses.items():
        pos_here = {p for p, _ in rows}
        if len(pos_here) < 2:
            continue
        table: dict[str, int] = {}
        for pos in pos_here:
            table[pos] = len(wordnet.synsets(word, wn_pos[pos]))
        if any(table.values()):
            weights[word] = table
    return weights


def build() -> None:
    if not JSONL_PATH.exists():
        raise SystemExit(f"{JSONL_PATH} not found")

    # word -> list of (pos, gloss); word -> list of (pos, lemma, tags)
    senses: dict[str, list[tuple[str, str]]] = {}
    redirects: dict[str, list[tuple[str, str, str]]] = {}
    roots: dict[str, list[tuple[str, str]]] = {}
    lines = 0

    with JSONL_PATH.open("r", encoding="utf-8", errors="ignore") as source:
        for line in source:
            lines += 1
            if lines % 500_000 == 0:
                print(f"  {lines:,} lines, {len(senses):,} words", file=sys.stderr)
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
            pos = entry.get("pos")
            if pos not in CONTENT_POS or not HEADWORD.match(word):
                continue

            glosses, redirect = first_signal(entry)
            if redirect is not None:
                lemma, tags = redirect
                kept = redirects.setdefault(word, [])
                if not any(p == pos for p, _, _ in kept):
                    # The form relation, in the words wiktextract tags it
                    # with: "past", "participle", "plural", ...
                    note = " ".join(
                        t for t in tags if t not in ("form-of", "alt-of")
                    )
                    kept.append((pos, lemma, note))
            else:
                kept_senses = senses.setdefault(word, [])
                for gloss in glosses:
                    if (
                        len(kept_senses) < PER_WORD
                        and sum(1 for p, _ in kept_senses if p == pos) < PER_POS
                    ):
                        kept_senses.append((pos, gloss))

            if word not in roots:
                found = extract_roots(entry)
                if found:
                    roots[word] = found

    print(f"resolving {len(redirects):,} redirected forms", file=sys.stderr)
    resolved = 0
    for surface, targets in redirects.items():
        rows = senses.setdefault(surface, [])
        for pos, lemma, note in targets:
            lemma_senses = [g for p, g in senses.get(lemma, []) if p == pos]
            if not lemma_senses:
                # The lemma has no gloss at this POS — fall back to any of
                # its senses rather than losing the form entirely.
                lemma_senses = [g for _, g in senses.get(lemma, [])][:1]
            for gloss in lemma_senses[:PER_POS]:
                prefix = f"Form of {lemma}" + (f" ({note})" if note else "")
                rows.append((pos, f"{prefix}: {gloss}"[:GLOSS_CAP]))
                resolved += 1
            # A form inherits its lemma's roots when it has none.
            if surface not in roots and lemma in roots:
                roots[surface] = roots[lemma]
        # Redirected readings come first: for an inflected surface form
        # they are close to certain to be the dominant reading (the same
        # judgement glosses.py's redirect override makes).
        rows.sort(key=lambda row: 0 if row[1].startswith("Form of ") else 1)

    # Which POS leads when nothing else decides: WordNet's own sense count
    # per POS is a fair stand-in for how a word is usually used — "know"
    # has eleven verb senses and no noun there, so the Scots hill never
    # again leads its card. Redirect-form readings still sort first.
    print("ordering senses by WordNet part-of-speech weight", file=sys.stderr)
    pos_weight = build_pos_weights(senses)
    for word, rows in senses.items():
        weights = pos_weight.get(word, {})
        # POS weight first, so "know" leads with its eleven verb senses
        # rather than the alt-of knoll; within one POS the redirect (form)
        # reading leads, so "sounded" and "found" read as their verbs'
        # pasts before anything rarer.
        rows.sort(
            key=lambda row, w=weights: (
                -w.get(row[0], 0),
                0 if row[1].startswith("Form of ") else 1,
            )
        )

    print(f"writing {OUT_PATH}", file=sys.stderr)
    if OUT_PATH.exists():
        OUT_PATH.unlink()
    db = sqlite3.connect(OUT_PATH)
    db.execute("CREATE TABLE senses (word TEXT PRIMARY KEY, senses TEXT NOT NULL)")
    db.execute("CREATE TABLE roots (word TEXT PRIMARY KEY, roots TEXT NOT NULL)")
    db.executemany(
        "INSERT INTO senses VALUES (?, ?)",
        (
            (word, json.dumps([{"pos": p, "def": g} for p, g in rows], ensure_ascii=False))
            for word, rows in sorted(senses.items())
            if rows
        ),
    )
    db.executemany(
        "INSERT INTO roots VALUES (?, ?)",
        (
            (word, json.dumps(rows, ensure_ascii=False))
            for word, rows in sorted(roots.items())
        ),
    )
    db.commit()
    db.close()
    print(
        f"wrote {OUT_PATH} ({len(senses):,} words, {resolved:,} resolved forms, "
        f"{len(roots):,} etymologies from {lines:,} lines)"
    )


if __name__ == "__main__":
    build()
