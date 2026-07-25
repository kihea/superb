"""Structural checks on content/passages/*.json beyond what JSON Schema can
express (docs/seams.md §Seam 2, workspace/tracks/T3-content.md §3).

- Every {n} placeholder in `text` has exactly one matching slot index, and
  vice versa — an orphaned placeholder or an unused slot is a build error,
  not a style note.
- Word count sits in the 120-220 band the track sets.
- Every slot's `class` names a real file in content/classes/.
- `defaultWord` is a plausible single word, not a phrase or empty string
  masquerading as one (schema's minLength:1 does not catch "  ").

What this script cannot check, and does not pretend to: "every slot has a
defaultWord that reads naturally" and "the passage reads as writing with any
legal fill" are the editorial bar from the track, and they were read against
by hand at authoring time — see the commit that added each passage.
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PASSAGES_DIR = ROOT / "passages"
CLASSES_DIR = ROOT / "classes"


def check_passage(path: pathlib.Path, known_classes: set[str]) -> list[str]:
    errors: list[str] = []
    doc = json.loads(path.read_text(encoding="utf-8"))
    pid = doc["id"]
    text = doc["text"]
    slots = doc["slots"]

    placeholder_indices = {int(m) for m in re.findall(r"\{(\d+)\}", text)}
    slot_indices = {s["index"] for s in slots}

    missing_slots = placeholder_indices - slot_indices
    unused_slots = slot_indices - placeholder_indices
    if missing_slots:
        errors.append(f"{pid}: placeholders {sorted(missing_slots)} have no matching slot")
    if unused_slots:
        errors.append(f"{pid}: slots {sorted(unused_slots)} have no placeholder in text")

    if len(slot_indices) != len(slots):
        errors.append(f"{pid}: duplicate slot indices in {[s['index'] for s in slots]}")

    word_count = len(text.split())
    if not (120 <= word_count <= 220):
        errors.append(f"{pid}: text is {word_count} words, outside 120-220")

    for slot in slots:
        cls = slot["class"]
        if cls not in known_classes:
            errors.append(f"{pid}: slot {slot['index']} references unknown class {cls!r}")
        default = slot["defaultWord"].strip()
        if not default or " " in default:
            errors.append(f"{pid}: slot {slot['index']} defaultWord {slot['defaultWord']!r} is not a single word")

    return errors


def main() -> int:
    known_classes = {p.stem for p in CLASSES_DIR.glob("*.json")}
    files = sorted(PASSAGES_DIR.glob("*.json"))

    errors: list[str] = []
    if len(files) < 40:
        errors.append(f"expected at least 40 passages, found {len(files)}")

    ids = set()
    for path in files:
        doc = json.loads(path.read_text(encoding="utf-8"))
        if doc["id"] in ids:
            errors.append(f"duplicate passage id {doc['id']!r}")
        ids.add(doc["id"])
        errors.extend(check_passage(path, known_classes))

    if errors:
        print(f"{len(errors)} passage failures across {len(files)} files:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    print(f"{len(files)} passages pass structural checks.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
