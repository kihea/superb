"""Checks the public licensing claims (README.md, CONTRIBUTING.md, LICENSE)
against the ledger they are supposed to summarise: data/MANIFEST.md and
data/NOTICE.md. Run by .github/workflows/docs.yml.

Why this exists. The licensing story lives in four ledger-ish places —
dataset rows in data/MANIFEST.md, travelling credits in data/NOTICE.md,
per-excerpt provenance in content/sources/*.json, and the reasoning in
ADR-008/ADR-025/ADR-035 — so every public summary (README, CONTRIBUTING,
LICENSE) is a fifth artifact kept in agreement with the ledger by care alone.
PR #85 (workspace/reviews/PR-85.md) took three review rounds to catch four
defects of exactly that class:

1. A flat "everything we write is CC0" claim, while content/difficulty.json
   ships with a required `wordfreq` credit.
2. LICENSE drifting from what README/CONTRIBUTING say (a public file left on
   the old flat wording after the other two were corrected).
3. A share-alike-derived artifact (the rewritten glosses) bucketed as
   unqualified CC0.
4. A public pointer naming data/MANIFEST.md as where excerpt/book provenance
   is recorded, when data/MANIFEST.md's own text says excerpts are not rows
   in that table.

This script does not re-litigate the settled wording those three rounds of
review produced — it wraps the specific licensing passages in HTML comment
markers (a mechanism addition, not a wording change) and checks the text
inside those markers against facts it derives from data/MANIFEST.md itself,
so a future change to either side of the relationship — the ledger, or the
public summary of it — that puts them out of step fails the build instead of
waiting for a fourth review round to notice.

Usage: python data/pipeline/check_license_claims.py [--root DIR]
"""

from __future__ import annotations

import argparse
import pathlib
import re
import sys

# Markers wrapping the passages this gate checks. Inserted around existing,
# unedited prose — see the PR body for the exact diff. A file missing its
# marker pair fails outright: the marker only ever disappears if the passage
# it wraps was replaced by something else, which is exactly defect 2's shape
# (LICENSE reverted to unqualified wording with no split language at all).
BLOCK_START = "<!-- LICENCE-CLAIMS:START -->"
BLOCK_END = "<!-- LICENCE-CLAIMS:END -->"
BULLET_START = "<!-- LICENCE-CLAIMS:BULLET:START -->"
BULLET_END = "<!-- LICENCE-CLAIMS:BULLET:END -->"

# One phrase, present in every file's marked block today, that says content
# is not under one flat licence. Not a style preference — it is the one
# sentence a revert to the old flat "everything is CC0" wording cannot
# contain, because the old wording's entire defect was asserting exactly one
# bucket for everything. Deliberately an OR of several phrasings rather than
# one exact string, because README, CONTRIBUTING and LICENSE were never
# required to use identical prose (PR-85 round 3, Attack 3: "a difference in
# detail, not a difference in claim").
SPLIT_ACKNOWLEDGED = re.compile(
    r"not all under one licen[cs]e|splits three ways|three kinds|own terms", re.IGNORECASE
)

# The literal historical defect-1 string (README.md:67 and CONTRIBUTING.md:184
# before PR #85's fix), kept as an exact-match falsifier in addition to the
# general check below: a future edit could satisfy the general check while
# still reintroducing this precise sentence elsewhere in the block.
FLAT_CC0_PHRASES = [
    re.compile(r"everything (we|this project) (writes?|wrote) is cc0", re.IGNORECASE),
]


def read_optional(path: pathlib.Path) -> str | None:
    return path.read_text(encoding="utf-8") if path.exists() else None


def extract_block(text: str, start: str, end: str) -> tuple[str | None, str | None]:
    """The text between one marker pair, or an error if either is missing.

    Returns (block, error). Exactly one is None.
    """
    si = text.find(start)
    ei = text.find(end)
    if si == -1 or ei == -1:
        return None, f"marker pair {start!r} / {end!r} not found (both must be present)"
    if ei < si:
        return None, f"marker {end!r} appears before {start!r}"
    return text[si + len(start):ei], None


def parse_manifest_rows(manifest_text: str) -> list[dict[str, str]]:
    """Every markdown table row in MANIFEST.md, as {header: cell}.

    Deliberately re-implemented rather than imported from
    check_license_gate.py: this gate has to keep working even if that one's
    internals change shape, and the parser is twelve lines.
    """
    rows: list[dict[str, str]] = []
    header: list[str] | None = None
    for line in manifest_text.splitlines():
        line = line.strip()
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if all(re.fullmatch(r"-+", c) for c in cells):
            continue
        if header is None:
            header = [c.lower() for c in cells]
            continue
        if len(cells) != len(header):
            continue
        rows.append(dict(zip(header, cells)))
    return rows


ATTRIBUTION_HINT = re.compile(r"\bcredit\b|\battribution\b", re.IGNORECASE)
ARTIFACT_PATH = re.compile(r"`?(content/[\w./-]+\.(?:json|md))`?")

# Content categories checked against an attributed row's own "used for"
# text — not against the row's dataset name, and not against any specific
# source's name (see the comment at attributed_content_categories). "gloss"
# is the only category this gate currently needs, because it is the only
# content type PR #85 found misclassified as CC0 while its source data was
# attribution-encumbered (defect 3). A future content type gets a line
# here, keyed to what the row says it produces, when it needs one.
CONTENT_CATEGORY_HINTS = {
    "gloss": re.compile(r"\bgloss", re.IGNORECASE),
}
# \s+ rather than literal spaces: MANIFEST.md's own prose wraps this
# sentence across a line break, so a literal " " between words does not
# match the real file even though the sentence itself is unchanged.
EXCERPT_NOT_ROWS = re.compile(
    r"sourced\s+excerpts.{0,60}?are\s+not\s+rows\s+in\s+this\s+table", re.IGNORECASE | re.DOTALL
)


class LedgerFacts:
    """What the ledger (data/MANIFEST.md, data/NOTICE.md) actually says,
    derived programmatically rather than duplicated into a second
    hand-maintained summary — see the module docstring's "one source of
    truth" requirement.
    """

    def __init__(self, manifest_text: str, notice_text: str) -> None:
        self.rows = parse_manifest_rows(manifest_text)
        used_for_key = next((k for k in (self.rows[0].keys() if self.rows else []) if "used for" in k), None)
        licence_key = next(
            (k for k in (self.rows[0].keys() if self.rows else []) if "licence" in k or "license" in k), None
        )
        name_key = next((k for k in (self.rows[0].keys() if self.rows else []) if k in ("dataset", "name")), None)

        self.attributed_artifacts: dict[str, str] = {}
        # Content categories an attributed row's own "used for" text says it
        # touches (category -> the row that said so). Built the same way
        # attributed_artifacts is: by reading what the row's text actually
        # says it produces, never by matching the row's own name or a
        # specific source's name. A row is free to be renamed, or a new
        # attributed source could arrive tomorrow, and this still finds the
        # fact from what the row says rather than from who said it — which
        # is exactly what the prior version of this file did not do (it
        # matched the literal substring "wiktionary", and went silently
        # green the moment a review renamed that row and reworded its
        # "used for" cell around the same word).
        self.attributed_content_categories: dict[str, str] = {}
        for row in self.rows:
            used_for = row.get(used_for_key, "") if used_for_key else ""
            licence = row.get(licence_key, "") if licence_key else ""
            dataset_name = row.get(name_key, "<unnamed>") if name_key else "<unnamed>"
            requires_attribution = bool(ATTRIBUTION_HINT.search(used_for) or ATTRIBUTION_HINT.search(licence))
            if not requires_attribution:
                continue
            for artifact in ARTIFACT_PATH.findall(used_for):
                self.attributed_artifacts[artifact] = dataset_name
            for category, pattern in CONTENT_CATEGORY_HINTS.items():
                if pattern.search(used_for) and category not in self.attributed_content_categories:
                    self.attributed_content_categories[category] = dataset_name
        self.gloss_requires_attribution = "gloss" in self.attributed_content_categories

        # Whether the ledger's own text says sourced excerpts are recorded as
        # rows in data/MANIFEST.md. If the disclaiming sentence can no longer
        # be found, this gate cannot vouch for the excerpt-location claim
        # either way — treated as "yes, may be rows" (the more permissive
        # reading), and check_ledger_integrity below fails loudly instead of
        # silently trusting a fact it can no longer see.
        self.excerpt_disclaimer_found = bool(EXCERPT_NOT_ROWS.search(manifest_text))
        self.excerpts_are_manifest_rows = not self.excerpt_disclaimer_found

        # The ledger's own "## Content licence" summary paragraph, checked
        # for self-contradiction below (check_ledger_self_consistency).
        m = re.search(r"##\s*Content licen[cs]e\s*\n(.*)", manifest_text, re.IGNORECASE | re.DOTALL)
        self.content_licence_section = m.group(1) if m else ""

        self.notice_present = bool(notice_text and notice_text.strip())


def check_ledger_integrity(facts: LedgerFacts, manifest_path: pathlib.Path) -> list[str]:
    """The ledger has to state the facts this gate depends on, or the gate
    is checking public claims against a silence rather than a ledger."""
    errors: list[str] = []
    if not facts.rows:
        errors.append(f"{manifest_path}: no table rows found — nothing to check public claims against")
    if not facts.excerpt_disclaimer_found:
        errors.append(
            f"{manifest_path}: no longer states that sourced excerpts are not rows in this table — "
            f"this gate can no longer verify the excerpt-location claim in the public files"
        )
    return errors


def check_ledger_self_consistency(facts: LedgerFacts, manifest_path: pathlib.Path) -> list[str]:
    """MANIFEST.md's own "Content licence" summary must not contradict its
    own per-dataset rows — the exact shape of defect 3, found live in the
    ledger itself rather than only historically in the public files."""
    errors: list[str] = []
    section = facts.content_licence_section
    if facts.gloss_requires_attribution and re.search(r"\bgloss", section, re.IGNORECASE):
        gloss_cc0 = re.search(r"gloss.{0,120}\bcc0\b|\bcc0\b.{0,120}gloss", section, re.IGNORECASE | re.DOTALL)
        qualified = re.search(r"wiktionary|share-alike|credit|attribution", section, re.IGNORECASE)
        if gloss_cc0 and not qualified:
            errors.append(
                f"{manifest_path}: '## Content licence' calls rewritten glosses CC0, but the Wiktionary "
                f"row above requires attribution — the ledger disagrees with itself"
            )
    return errors


def check_block(block: str, facts: LedgerFacts, label: str, require_named_examples: bool) -> list[str]:
    """The checks a marked passage in a public file must pass, each one
    tracing to a named historical defect or to the standing rule ADR-025
    Decision 5 states ("no day on which two public files disagree").

    require_named_examples: whether this passage must name every ledger
    artifact that needs attribution by filename. True for README.md's
    Licensing section and CONTRIBUTING.md's fuller Licensing section, which
    already do this today. False for LICENSE and CONTRIBUTING.md's terse
    checklist bullet — PR #85 round 3's own review (Attack 3) explicitly
    accepted LICENSE staying terser than the other two ("a true but less
    illustrated version of the same rule, not a different rule"), and round
    4's Finding 11 fix for the bullet was accepted without adding
    difficulty.json's name to it. Holding those two passages to a bar the
    settled review never asked of them would be this gate improving wording
    PR #85 already settled, which is exactly what this track is not for.
    """
    errors: list[str] = []

    for pattern in FLAT_CC0_PHRASES:
        if pattern.search(block):
            errors.append(
                f"{label}: contains the historical flat-CC0 claim ({pattern.pattern!r}) — "
                f"defect 1 (PR #85 round 1, finding 1)"
            )

    if re.search(r"\bcc0\b", block, re.IGNORECASE) and not SPLIT_ACKNOWLEDGED.search(block):
        errors.append(
            f"{label}: mentions CC0 without acknowledging content is not all under one licence — "
            f"defect 1/2 shape (a claim this broad needs a stated exception)"
        )

    if require_named_examples:
        for artifact, dataset in facts.attributed_artifacts.items():
            name = artifact.rsplit("/", 1)[-1]
            if re.search(r"\bcc0\b", block, re.IGNORECASE) and name not in block:
                errors.append(
                    f"{label}: claims CC0 coverage but never names {name!r}, which data/MANIFEST.md's "
                    f"{dataset!r} row says requires attribution — defect 1 (PR #85 round 1, finding 1)"
                )

    # The next two checks work paragraph by paragraph (markdown's own
    # blank-line clause boundary) rather than by a character window over the
    # whole block. A whole-block proximity window is exactly what produced a
    # false reading of README.md's real, correct text while this script was
    # built: "data/MANIFEST.md" (for datasets) and "excerpt" (for its own,
    # separate, beside-it record) sit twenty words apart in one true
    # sentence, and a window wide enough to catch the real defect was also
    # wide enough to cross that sentence's own semicolon.
    paragraphs = re.split(r"\n\s*\n", block)

    if facts.gloss_requires_attribution:
        for para in paragraphs:
            if not re.search(r"\bgloss", para, re.IGNORECASE):
                continue
            gloss_cc0 = re.search(r"gloss.{0,120}\bcc0\b|\bcc0\b.{0,120}gloss", para, re.IGNORECASE | re.DOTALL)
            qualified = re.search(r"wiktionary|share-alike|pass-on-the-same-freedom|credit", para, re.IGNORECASE)
            if gloss_cc0 and not qualified:
                errors.append(
                    f"{label}: buckets rewritten glosses as CC0 without naming Wiktionary's terms — "
                    f"defect 3 (PR #85 round 2, finding 7)"
                )

    if facts.excerpts_are_manifest_rows is False:
        for para in paragraphs:
            low = para.lower()
            if "excerpt" not in low or "data/manifest.md" not in low:
                continue
            # A paragraph naming both may still be correct if it is only
            # saying datasets have a manifest row *and*, separately, an
            # excerpt has its own beside-it record — the real README
            # sentence does exactly this (a semicolon apart in one
            # sentence). Deliberately checked at paragraph granularity, not
            # by splitting on "." — "data/MANIFEST.md" contains a period of
            # its own, and splitting on it breaks the filename apart before
            # the substring check ever runs.
            if "beside" in low or "not rows" in low or "not a row" in low:
                continue
            errors.append(
                f"{label}: points a reader to data/MANIFEST.md for excerpt provenance, but the "
                f"ledger's own text says sourced excerpts are not rows there — "
                f"defect 4 (PR #85 round 2, finding 8)"
            )

    return errors


CHECKS = [
    # (file, description, marker pair, require_named_examples)
    ("README.md", "the Licensing section", (BLOCK_START, BLOCK_END), True),
    ("CONTRIBUTING.md", "the conventions checklist bullet", (BULLET_START, BULLET_END), False),
    ("CONTRIBUTING.md", "the Licensing section", (BLOCK_START, BLOCK_END), True),
    ("LICENSE", "the content-licensing paragraph", (BLOCK_START, BLOCK_END), False),
]


def run(root: pathlib.Path) -> list[str]:
    errors: list[str] = []

    manifest_path = root / "data" / "MANIFEST.md"
    notice_path = root / "data" / "NOTICE.md"
    manifest_text = read_optional(manifest_path)
    notice_text = read_optional(notice_path)
    if manifest_text is None:
        return [f"{manifest_path}: does not exist"]
    if notice_text is None:
        errors.append(f"{notice_path}: does not exist")

    facts = LedgerFacts(manifest_text, notice_text or "")
    errors.extend(check_ledger_integrity(facts, manifest_path))
    errors.extend(check_ledger_self_consistency(facts, manifest_path))

    texts: dict[str, str] = {}
    for filename, _desc, _markers, _strict in CHECKS:
        if filename not in texts:
            path = root / filename
            text = read_optional(path)
            if text is None:
                errors.append(f"{path}: does not exist")
            texts[filename] = text or ""

    for filename, desc, (start, end), require_named_examples in CHECKS:
        label = f"{filename} ({desc})"
        block, block_error = extract_block(texts[filename], start, end)
        if block_error is not None:
            errors.append(f"{label}: {block_error}")
            continue
        errors.extend(check_block(block, facts, label, require_named_examples))

    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    repo_root = pathlib.Path(__file__).resolve().parent.parent.parent
    parser.add_argument("--root", type=pathlib.Path, default=repo_root)
    args = parser.parse_args()

    errors = run(args.root)
    if errors:
        print(f"{len(errors)} licence-claims gate failure(s):", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1
    print(
        "licence-claims gate passes: README.md, CONTRIBUTING.md and LICENSE agree with each "
        "other and with data/MANIFEST.md on every claim this gate can check."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
