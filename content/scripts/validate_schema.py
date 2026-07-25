"""Validates every content file against its JSON Schema (docs/seams.md §Seam 2).

Draft 2020-12. Every field the seam shows is required — additionalProperties
is false on all three schemas, so a stray or misspelled field is a failure,
not a warning.

Usage: python content/scripts/validate_schema.py
"""

from __future__ import annotations

import json
import pathlib
import sys

from jsonschema import Draft202012Validator

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCHEMA_DIR = ROOT / "schema"

TARGETS = [
    ("passages", "passage.schema.json"),
    ("sources", "source.schema.json"),
    ("classes", "class.schema.json"),
]


def main() -> int:
    errors: list[str] = []
    total = 0

    for content_dir, schema_name in TARGETS:
        schema_path = SCHEMA_DIR / schema_name
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)
        validator = Draft202012Validator(schema)

        files = sorted((ROOT / content_dir).glob("*.json"))
        if not files:
            errors.append(f"{content_dir}/: no content files found")
        for path in files:
            total += 1
            try:
                doc = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as e:
                errors.append(f"{path}: invalid JSON — {e}")
                continue
            for err in sorted(validator.iter_errors(doc), key=lambda e: e.path):
                loc = "/".join(str(p) for p in err.path) or "<root>"
                errors.append(f"{path}: [{loc}] {err.message}")

    if errors:
        print(f"{len(errors)} schema failures across {total} files:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    print(f"{total} content files validate against their schemas.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
