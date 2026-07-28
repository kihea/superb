"""The CI gate ADR-008 requires, run by .github/workflows/data-license.yml.

Fails the build if:

1. Any file under `content/sources/` has an incomplete `provenance` — every
   field is required, checked directly here rather than trusted from JSON
   Schema alone, because this gate must fail on its own if the schema ever
   drifts.
2. Any dataset `data/pipeline/*.py` touches is missing a row in
   `data/MANIFEST.md` (a pipeline script's own filename must appear
   somewhere in the manifest's "Used for" column).
3. Any manifest row's licence cell names a licence on the forbidden list —
   an NC/ND/non-commercial variant, "all rights reserved", or the two
   datasets named permanently forbidden by law 4 (SWOW-EN, the USF
   free-association norms) — regardless of how the row justifies it.

Usage: python data/pipeline/check_license_gate.py [--content DIR] [--data DIR]
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys

REQUIRED_PROVENANCE_FIELDS = ["work", "author", "year", "source", "url", "licence", "retrieved"]

# Substrings that, if found in a manifest row's licence cell, fail the build
# outright. Matched case-insensitively against the licence *cell* only, never
# against the whole file — the file's own "Forbidden, permanently" section
# names these deliberately and must not trip its own gate.
FORBIDDEN_LICENCE_PATTERNS = [
    r"\bnc\b", r"-nc\b", r"\bnc-", r"non-?commercial",
    r"all rights reserved",
    r"\bnd\b", r"-nd\b",  # NoDerivatives variants
    r"swow",
    r"usf free-association",
]

# Pipeline scripts that are allowed to have no manifest row of their own
# because they produce no third-party dataset (e.g. a one-off helper).
NO_MANIFEST_ROW_NEEDED = {
    "__init__.py",
    "check_license_gate.py",
    # Reads content/sources/*.json and data/out/frequency.json, both already
    # covered elsewhere (per-excerpt provenance, and the wordfreq row) —
    # produces a derived index/report, not a new third-party dataset.
    "corpus_report.py",
}


def check_provenance(sources_dir: pathlib.Path) -> list[str]:
    errors: list[str] = []
    files = sorted(p for p in sources_dir.glob("*.json")) if sources_dir.exists() else []
    if not files:
        errors.append(f"{sources_dir}: no sourced excerpts found")
    for path in files:
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            errors.append(f"{path}: invalid JSON — {e}")
            continue
        provenance = doc.get("provenance")
        if not isinstance(provenance, dict):
            errors.append(f"{path}: missing provenance object entirely")
            continue
        for field in REQUIRED_PROVENANCE_FIELDS:
            value = provenance.get(field)
            if value is None or (isinstance(value, str) and not value.strip()):
                errors.append(f"{path}: provenance.{field} is missing or empty")
    return errors


def parse_manifest_rows(manifest_text: str) -> list[dict[str, str]]:
    """Every markdown table row in MANIFEST.md, as {header: cell}."""
    rows: list[dict[str, str]] = []
    header: list[str] | None = None
    for line in manifest_text.splitlines():
        line = line.strip()
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if all(re.fullmatch(r"-+", c) for c in cells):
            continue  # the |---|---| separator row
        if header is None:
            header = [c.lower() for c in cells]
            continue
        if len(cells) != len(header):
            continue
        rows.append(dict(zip(header, cells)))
    return rows


def check_manifest(manifest_path: pathlib.Path) -> tuple[list[str], list[dict[str, str]]]:
    errors: list[str] = []
    if not manifest_path.exists():
        return [f"{manifest_path}: does not exist"], []
    text = manifest_path.read_text(encoding="utf-8")
    rows = parse_manifest_rows(text)
    if not rows:
        errors.append(f"{manifest_path}: no table rows found")
    return errors, rows


def check_forbidden_licences(rows: list[dict[str, str]], manifest_path: pathlib.Path) -> list[str]:
    errors: list[str] = []
    licence_key = next((k for k in (rows[0].keys() if rows else []) if "licence" in k or "license" in k), None)
    if rows and licence_key is None:
        errors.append(f"{manifest_path}: table has no Licence column")
        return errors
    for row in rows:
        cell = row.get(licence_key, "") if licence_key else ""
        cell_lower = cell.lower()
        for pattern in FORBIDDEN_LICENCE_PATTERNS:
            if re.search(pattern, cell_lower):
                name = row.get("name") or row.get("dataset") or "<unnamed row>"
                errors.append(
                    f"{manifest_path}: row {name!r} names a forbidden licence "
                    f"({pattern!r} matched in {cell!r})"
                )
                break
    return errors


def check_datasets_have_rows(pipeline_dir: pathlib.Path, rows: list[dict[str, str]]) -> list[str]:
    errors: list[str] = []
    used_for_key = next((k for k in (rows[0].keys() if rows else []) if "used for" in k), None)
    all_used_for = " ".join(row.get(used_for_key, "") for row in rows) if used_for_key else ""
    scripts = sorted(p.name for p in pipeline_dir.glob("*.py")) if pipeline_dir.exists() else []
    for script in scripts:
        if script in NO_MANIFEST_ROW_NEEDED:
            continue
        if script not in all_used_for:
            errors.append(
                f"{pipeline_dir / script}: no data/MANIFEST.md row mentions this script "
                f"(dataset used with no manifest row)"
            )
    return errors


def run(sources_dir: pathlib.Path, manifest_path: pathlib.Path, pipeline_dir: pathlib.Path) -> list[str]:
    errors: list[str] = []
    errors.extend(check_provenance(sources_dir))
    manifest_errors, rows = check_manifest(manifest_path)
    errors.extend(manifest_errors)
    errors.extend(check_forbidden_licences(rows, manifest_path))
    errors.extend(check_datasets_have_rows(pipeline_dir, rows))
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    repo_root = pathlib.Path(__file__).resolve().parent.parent.parent
    parser.add_argument("--content", type=pathlib.Path, default=repo_root / "content")
    parser.add_argument("--data", type=pathlib.Path, default=repo_root / "data")
    args = parser.parse_args()

    errors = run(args.content / "sources", args.data / "MANIFEST.md", args.data / "pipeline")
    if errors:
        print(f"{len(errors)} data-licence gate failures:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1
    print("data-licence gate passes: provenance complete, manifest complete, no forbidden licences.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
