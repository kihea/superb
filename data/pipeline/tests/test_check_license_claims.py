"""Proves the CI gate (.github/workflows/docs.yml) actually gates.

A check that has never been made to fail is not verified, it is hoped for.
`fixtures/licence_claims/` carries a `_good` baseline (a small, self-contained
set of README.md/CONTRIBUTING.md/LICENSE/data/MANIFEST.md files that pass) and
four `defect-N/` directories, each the baseline with exactly one change —
reproducing, in miniature, one of the four defects `workspace/reviews/PR-85.md`
took three review rounds to catch:

1. A flat "everything we write is CC0" claim, silent about
   content/difficulty.json's required wordfreq credit.
2. LICENSE reverted to the old flat, unqualified wording while
   README/CONTRIBUTING kept the corrected split.
3. Rewritten glosses bucketed as unqualified CC0, silent about Wiktionary's
   share-alike terms.
4. A claim that excerpt provenance is recorded in data/MANIFEST.md, when the
   manifest's own text says sourced excerpts are not rows there.

This asserts `check_license_claims.py` fails on each of the four, each
failure naming the defect it reproduces, before it ever asserts the same
script passes on the real tree — the same discipline
`test_check_license_gate.py` already uses for the content-licence gate.

A fifth fixture, `defect-3-renamed/`, is the PR #96 review's own attack,
made permanent: defect 3's shape, reintroduced with the attributed
dataset's row renamed and the word "Wiktionary" stripped from its "used
for" cell (keeping the share-alike licence and the attribution language).
The gate's gloss-attribution fact used to be a hardcoded match on the
literal string "wiktionary" and went silently green on exactly this
fixture; it is derived generically now (from the row's own "used for"
text, the same way every other fact in this file is), and this fixture is
what keeps it that way — if this fact is ever re-hardcoded to a name, this
is the fixture that catches it.

Run: python data/pipeline/tests/test_check_license_claims.py
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PIPELINE_DIR = HERE.parent
ROOT = PIPELINE_DIR.parent.parent
GATE_SCRIPT = PIPELINE_DIR / "check_license_claims.py"
FIXTURES = HERE / "fixtures" / "licence_claims"
PYTHON = sys.executable

# Each defect fixture, and the distinctive substring its failure output must
# contain — naming the defect rather than just "the gate failed at all", so a
# check that stopped catching one specific defect while still catching the
# other three cannot pass this file by accident.
DEFECTS = {
    "defect-1": "defect 1",
    "defect-2": "defect 1/2 shape",
    "defect-3": "defect 3",
    "defect-4": "defect 4",
    "defect-3-renamed": "defect 3",
}


def run(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [PYTHON, str(GATE_SCRIPT), *args], capture_output=True, text=True
    )


def main() -> int:
    problems: list[str] = []

    good = run("--root", str(FIXTURES / "_good"))
    if good.returncode != 0:
        problems.append(
            f"_good fixture: expected the gate to pass, but it failed:\n{good.stdout}{good.stderr}"
        )

    for name, must_mention in DEFECTS.items():
        broken = run("--root", str(FIXTURES / name))
        output = broken.stdout + broken.stderr
        if broken.returncode == 0:
            problems.append(f"{name}: expected the gate to fail, but it passed")
        elif must_mention.lower() not in output.lower():
            problems.append(f"{name}: failure output did not mention {must_mention!r}:\n{output}")
        else:
            print(f"{name}: gate correctly fails —\n{output}")

    real = run()  # defaults to the repo's real README.md, CONTRIBUTING.md, LICENSE, data/MANIFEST.md
    if real.returncode != 0:
        problems.append(f"real tree: expected the gate to pass, but it failed:\n{real.stdout}{real.stderr}")
    else:
        print(f"real tree: gate passes —\n{real.stdout}")

    if problems:
        print(f"{len(problems)} gate-verification failure(s):", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    print(
        f"check_license_claims.py fails on all {len(DEFECTS)} fixtures (the four "
        "historical defects and the PR #96 rename attack, each naming the right "
        "defect) and passes on the real tree."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
