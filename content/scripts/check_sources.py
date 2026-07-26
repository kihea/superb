"""Structural checks on content/sources/*.json beyond JSON Schema
(docs/seams.md §Seam 2, workspace/tracks/T3-content.md §4, ADR-008).

- Excerpt is 80-200 words.
- Every listed word actually appears in the text (case-insensitive, allowing
  for a common inflection) — `words` cannot name a word the excerpt never
  uses. Whether the context is genuinely *informative* is an editorial
  judgment made at authoring time, which this cannot check; presence is the
  floor, not the bar.
- `provenance.source` names one of the three allow-listed origins (ADR-018
  Decision 2: Standard Ebooks, then Project Gutenberg, then Wikisource cited
  by revision permalink) — never an open-web source, which cannot be
  verified per row and so fails law 4 mechanically rather than editorially.

Datasets (frequency, glosses, pseudowords) get rows in data/MANIFEST.md;
individual literary excerpts do not — each carries its own complete
provenance record instead (ADR-008 amendment), which is what this script and
the schema check.
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCES_DIR = ROOT / "sources"

ALLOWED_SOURCE_PREFIXES = ("Standard Ebooks", "Project Gutenberg", "Wikisource")


def word_appears(word: str, text: str) -> bool:
    text_lower = text.lower()
    w = word.lower()
    # allow the excerpt to carry an inflected form (plural, -ed, -ing, -s)
    stem = w[:-1] if w.endswith("e") else w
    pattern = r"\b" + re.escape(stem) + r"[a-z]*\b"
    return re.search(pattern, text_lower) is not None


def check_source(path: pathlib.Path) -> list[str]:
    errors: list[str] = []
    doc = json.loads(path.read_text(encoding="utf-8"))
    sid = doc["id"]
    text = doc["text"]
    words = doc["words"]

    word_count = len(text.split())
    if not (80 <= word_count <= 200):
        errors.append(f"{sid}: excerpt is {word_count} words, outside 80-200")

    for w in words:
        if not word_appears(w, text):
            errors.append(f"{sid}: word {w!r} does not appear in the excerpt text")

    source_name = doc["provenance"]["source"]
    if not source_name.startswith(ALLOWED_SOURCE_PREFIXES):
        errors.append(
            f"{sid}: provenance.source {source_name!r} is not one of the "
            f"allow-listed origins {ALLOWED_SOURCE_PREFIXES} (ADR-018)"
        )

    return errors


def main() -> int:
    files = sorted(p for p in SOURCES_DIR.glob("*.json") if not p.stem.startswith("_"))
    errors: list[str] = []
    # Track T3b (workspace/tracks/T3-corpus-scale.md): the 60 hand-authored
    # excerpts could never clear min_sourced_coverage at any tuning, so the
    # real floor is the corpus scale that target requires, not the original
    # seed count.
    if len(files) < 1500:
        errors.append(f"expected at least 1500 sourced excerpts, found {len(files)}")

    ids = set()
    for path in files:
        doc = json.loads(path.read_text(encoding="utf-8"))
        if doc["id"] in ids:
            errors.append(f"duplicate source id {doc['id']!r}")
        ids.add(doc["id"])
        errors.extend(check_source(path))

    if errors:
        print(f"{len(errors)} source failures across {len(files)} files:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    print(f"{len(files)} sourced excerpts pass structural checks.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
