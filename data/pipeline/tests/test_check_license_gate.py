"""Proves the CI gate (.github/workflows/data-license.yml) actually gates.

A check that has never been made to fail is not verified, it is hoped for.
`fixtures/broken/` is deliberately wrong three ways at once — a sourced
excerpt with no `provenance.licence`, a manifest row naming SWOW-EN under
its own forbidden licence family, and a pipeline script no manifest row
mentions — and this asserts `check_license_gate.py` catches all three, by
name, before it ever asserts the same script passes on the real tree.

Run: python data/pipeline/tests/test_check_license_gate.py
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PIPELINE_DIR = HERE.parent
ROOT = PIPELINE_DIR.parent.parent
GATE_SCRIPT = PIPELINE_DIR / "check_license_gate.py"
FIXTURE = HERE / "fixtures" / "broken"
PYTHON = sys.executable


def run(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [PYTHON, str(GATE_SCRIPT), *args], capture_output=True, text=True
    )


def main() -> int:
    problems: list[str] = []

    broken = run("--content", str(FIXTURE / "content"), "--data", str(FIXTURE / "data"))
    output = broken.stdout + broken.stderr
    if broken.returncode == 0:
        problems.append("broken fixture: expected the gate to fail, but it passed")
    for must_mention in ["licence", "SWOW", "fake_dataset.py"]:
        if must_mention.lower() not in output.lower():
            problems.append(f"broken fixture: failure output did not mention {must_mention!r}:\n{output}")

    real = run()  # defaults to the repo's real content/ and data/
    if real.returncode != 0:
        problems.append(f"real tree: expected the gate to pass, but it failed:\n{real.stdout}{real.stderr}")

    if problems:
        print(f"{len(problems)} gate-verification failure(s):", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    print("check_license_gate.py fails on the broken fixture (for all three reasons) and passes on the real tree.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
