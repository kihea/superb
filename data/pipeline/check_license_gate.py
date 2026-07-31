"""The CI gate ADR-008 requires, run by .github/workflows/data-license.yml.

Fails the build if:

1. Any file under `content/sources/` has an incomplete `provenance` — every
   field is required, checked directly here rather than trusted from JSON
   Schema alone, because this gate must fail on its own if the schema ever
   drifts.
2. Any dataset `data/pipeline/*.py` touches is missing a row in
   `data/MANIFEST.md` (a pipeline script's own filename must appear
   somewhere in the manifest's "Used for" column).
3. Any licence on the forbidden list — an NC/ND/non-commercial variant,
   "all rights reserved", or the two datasets named permanently forbidden by
   law 4 (SWOW-EN, the USF free-association norms) — regardless of how it is
   justified, in EITHER of the two places a licence is stated: a manifest
   row's licence cell, or a sourced excerpt's `provenance.licence`.

   The second half of that used to be missing, and it was the hole a
   post-merge review of PR #24 walked straight through: excerpts were moved
   out of the manifest and into their own per-file provenance records (the
   ADR-008 amendment), which left `provenance.licence` — free text on every
   excerpt — screened by nothing at all. A `CC BY-NC-ND 4.0` excerpt passed
   this gate, `check_sources.py` and `validate_schema.py` with exit 0 on all
   three. Law 8 says no non-commercial or all-rights-reserved data ever
   enters a build; a gate that reads only the table cannot say that.

4. Any excerpt's stated public-domain basis is not true of that excerpt.
   The basis is one rule -- US publication before 1929 -- and the fact it
   rests on, the year, is a field in the same record, so the claim is
   checkable per work rather than merely uniform. An excerpt claiming the
   pre-1929 basis while carrying a later year fails here.

Usage: python data/pipeline/check_license_gate.py [--content DIR] [--data DIR]
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys

REQUIRED_PROVENANCE_FIELDS = ["work", "author", "year", "source", "url", "licence", "retrieved"]

# Substrings that, if found in a stated licence, fail the build outright.
# Matched case-insensitively against the licence *value* only — a manifest
# row's licence cell, or an excerpt's provenance.licence — never against the
# whole file, because MANIFEST.md's own "Forbidden, permanently" section names
# these deliberately and must not trip its own gate.
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
    # Reads README.md, CONTRIBUTING.md, LICENSE and data/MANIFEST.md itself
    # and checks the first three against the last — no third-party dataset
    # of its own, same reasoning as this file's own entry above.
    "check_license_claims.py",
    # Reads content/sources/*.json and data/out/frequency.json, both already
    # covered elsewhere (per-excerpt provenance, and the wordfreq row) —
    # produces a derived index/report, not a new third-party dataset.
    "corpus_report.py",
}


# The one public-domain basis this corpus rests on, and the year it turns on.
# US copyright runs 95 years from publication for works of this era, so a work
# published before 1929 is public domain in the United States outright. This
# replaced "Public Domain (US, life+70 expired)", which was the wrong rule --
# life+70 applies to works created from 1978 onward, and for W. E. B. Du Bois
# (d. 1963) it has not run yet, so an excerpt from The Souls of Black Folk
# (1903) stated a justification that had demonstrably not occurred for a
# conclusion that is nonetheless true. A false reason for a right answer is
# still unfit for a provenance record, whose whole job is to be checkable.
PUBLIC_DOMAIN_BASIS = "Public Domain (US: published before 1929)"
PUBLIC_DOMAIN_CUTOFF_YEAR = 1929

# An excerpt may only state a basis this gate knows how to check. Today that
# is exactly one, because every excerpt in the corpus is a pre-1929 US
# publication from Project Gutenberg. A second entry is welcome the day a
# genuinely different basis arrives (a Crown-copyright expiry, a CC0
# dedication) -- but it has to be added here, next to the code that verifies
# it, rather than written freehand into 2,599 files where nothing reads it.
# Free text is how the old basis stayed wrong in every record at once.
VERIFIABLE_PUBLIC_DOMAIN_BASES = {PUBLIC_DOMAIN_BASIS}


def forbidden_licence_match(licence: str) -> str | None:
    """The first forbidden pattern this licence value matches, if any."""
    lowered = licence.lower()
    for pattern in FORBIDDEN_LICENCE_PATTERNS:
        if re.search(pattern, lowered):
            return pattern
    return None


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

        # The licence is screened here, at the only place it is now stated.
        licence = provenance.get("licence")
        if isinstance(licence, str) and licence.strip():
            pattern = forbidden_licence_match(licence)
            if pattern is not None:
                errors.append(
                    f"{path}: provenance.licence names a forbidden licence "
                    f"({pattern!r} matched in {licence!r})"
                )
            # A basis is only worth stating if it is true of this work. Checked
            # against the year in the same record, so the claim stands or falls
            # per excerpt rather than being uniform and unexamined.
            elif licence.strip() not in VERIFIABLE_PUBLIC_DOMAIN_BASES:
                errors.append(
                    f"{path}: provenance.licence is {licence!r}, which this gate has no way "
                    f"to check — add it to VERIFIABLE_PUBLIC_DOMAIN_BASES with the code that "
                    f"verifies it, or state one of: {sorted(VERIFIABLE_PUBLIC_DOMAIN_BASES)}"
                )
            else:
                year = provenance.get("year")
                if not isinstance(year, int):
                    errors.append(
                        f"{path}: provenance.licence claims publication before "
                        f"{PUBLIC_DOMAIN_CUTOFF_YEAR} but provenance.year is {year!r}, not a year"
                    )
                elif year >= PUBLIC_DOMAIN_CUTOFF_YEAR:
                    errors.append(
                        f"{path}: provenance.licence claims publication before "
                        f"{PUBLIC_DOMAIN_CUTOFF_YEAR}, but provenance.year is {year}"
                    )
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
        pattern = forbidden_licence_match(cell)
        if pattern is not None:
            name = row.get("name") or row.get("dataset") or "<unnamed row>"
            errors.append(
                f"{manifest_path}: row {name!r} names a forbidden licence "
                f"({pattern!r} matched in {cell!r})"
            )
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
    # Says which licences were screened, not just "no forbidden licences".
    # The old message was accurate about the manifest and silent about the
    # excerpts, which is what a reader remembers wrongly.
    print(
        "data-licence gate passes: provenance complete, manifest complete, "
        "no forbidden licence in any manifest row or excerpt provenance, "
        "every stated public-domain basis true of its own work."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
