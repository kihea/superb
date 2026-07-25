"""Structural checks on content/sources/*.json beyond JSON Schema
(docs/seams.md §Seam 2, workspace/tracks/T3-content.md §4, ADR-008).

- Excerpt is 80-200 words.
- Every listed word actually appears in the text (case-insensitive, allowing
  for a common inflection) — `words` cannot name a word the excerpt never
  uses. Whether the context is genuinely *informative* is an editorial
  judgment made at authoring time, which this cannot check; presence is the
  floor, not the bar.
- Every source is also a row in data/MANIFEST.md, keyed by its provenance
  `source` field — the same rule data-license.yml enforces in CI, checked
  here too so a broken row fails before it reaches that gate.
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCES_DIR = ROOT / "sources"
MANIFEST = ROOT.parent / "data" / "MANIFEST.md"


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

    return errors


def main() -> int:
    files = sorted(SOURCES_DIR.glob("*.json"))
    errors: list[str] = []
    if len(files) < 60:
        errors.append(f"expected at least 60 sourced excerpts, found {len(files)}")

    manifest_text = MANIFEST.read_text(encoding="utf-8") if MANIFEST.exists() else ""

    ids = set()
    for path in files:
        doc = json.loads(path.read_text(encoding="utf-8"))
        if doc["id"] in ids:
            errors.append(f"duplicate source id {doc['id']!r}")
        ids.add(doc["id"])
        errors.extend(check_source(path))

        source_name = doc["provenance"]["source"]
        if source_name not in manifest_text:
            errors.append(
                f"{doc['id']}: provenance.source {source_name!r} has no row in data/MANIFEST.md"
            )

    if errors:
        print(f"{len(errors)} source failures across {len(files)} files:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    print(f"{len(files)} sourced excerpts pass structural checks.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
