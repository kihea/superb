"""Run every executable pipeline regression test with one command.

The files predate a shared test framework and intentionally remain runnable
standalone. This runner makes their discovery explicit so adding a test file
cannot leave it outside CI. The two licence-gate tests are named as required
because this workflow exists to prove those gates bite; everything else is
discovered.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REQUIRED = {
    "test_check_license_claims.py",
    "test_check_license_gate.py",
}


def main() -> int:
    discovered = {path.name for path in HERE.glob("test_*.py")}
    missing = sorted(REQUIRED - discovered)
    if missing:
        print(f"aggregate test runner is missing required tests: {', '.join(missing)}", file=sys.stderr)
        return 1

    failures: list[str] = []
    for name in sorted(discovered):
        print(f"\n=== {name} ===", flush=True)
        result = subprocess.run([sys.executable, str(HERE / name)], cwd=HERE.parents[2])
        if result.returncode != 0:
            failures.append(name)

    if failures:
        print(f"\n{len(failures)} Python test file(s) failed: {', '.join(failures)}", file=sys.stderr)
        return 1
    print(f"\nAll {len(discovered)} Python test files passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
