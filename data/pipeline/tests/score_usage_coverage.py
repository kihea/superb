"""ADVISORY-012 SS3, step 2's scoring: reads usage_coverage_sample.json and
usage_coverage_key.json and reports precision on the usage-register
signal's NEW fires -- claims the current three signals do not make -- with
a 95% Wilson interval, same convention as every other frozen sample in this
track.

Run: python data/pipeline/tests/score_usage_coverage.py
"""
from __future__ import annotations

import json
import math
import pathlib

HERE = pathlib.Path(__file__).parent


def wilson_ci(tp: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (float("nan"), float("nan"))
    p = tp / n
    denom = 1 + z * z / n
    centre = p + z * z / (2 * n)
    adj = z * math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)
    return ((centre - adj) / denom, (centre + adj) / denom)


def main() -> int:
    sample = json.loads((HERE / "usage_coverage_sample.json").read_text(encoding="utf-8"))
    key = json.loads((HERE / "usage_coverage_key.json").read_text(encoding="utf-8"))["verdicts"]

    missing = [s["id"] for s in sample if s["id"] not in key]
    if missing:
        raise SystemExit(f"key is missing entries for: {missing}")

    n = len(sample)
    tp = sum(1 for s in sample if key[s["id"]]["informative"])
    precision = tp / n
    lo, hi = wilson_ci(tp, n)

    print(f"n = {n} (uniform sample of the complete new-fire population, seed 20260727)")
    print(f"precision (usage-register overlap on claims the current signals do not make, "
          f"hand key agrees): {tp}/{n} = {precision:.1%}")
    print(f"95% Wilson CI: [{lo:.1%}, {hi:.1%}]")
    print(f"clears the stated 40% floor with the interval included: {'yes' if lo >= 0.40 else 'no'} "
          f"(lower bound {lo:.1%})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
