"""Holds content/difficulty.json to its generator and to ADR-029's claims.

Run: python data/pipeline/tests/test_difficulty.py

Two jobs. The first is the derive-or-diff rule: the committed artifact is
regenerated in memory and compared byte for byte, so adding a slot-class
member without regenerating fails here instead of shipping a word the shell
cannot rank. The second is that ADR-029's *measured* claims -- the ones it
separates from its asserted ones -- stay true as content grows.
"""

from __future__ import annotations

import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import difficulty  # noqa: E402

# tuning.toml's own values, read rather than copied, so a retuned band checks
# the band it actually is.
BAND_LOW = -0.2
BAND_HIGH = 0.6
SEED_SLOTS_PER_PASSAGE = 2


def tuning() -> dict:
    import tomllib

    return tomllib.loads(difficulty.TUNING_PATH.read_text(encoding="utf-8"))


def failures() -> list[str]:
    errors: list[str] = []
    committed_text = difficulty.OUT_PATH.read_text(encoding="utf-8")
    fresh = difficulty.build()

    # 1. The artifact is exactly what the generator produces today.
    if committed_text != difficulty.serialize(fresh):
        errors.append(
            f"{difficulty.OUT_PATH} does not match a fresh run of "
            f"data/pipeline/difficulty.py. Regenerate it and commit the result "
            f"in the same change as whatever moved -- most often a word added "
            f"to content/classes/_seed.py."
        )

    committed = json.loads(committed_text)
    table: dict[str, float] = committed["words"]

    # 2. Every placeable word has a difficulty. A word in a slot class with no
    #    row here is one the shell cannot rank, filter, or seed.
    missing = sorted(set(difficulty.class_words()) - set(table))
    if missing:
        errors.append(f"slot-class members with no difficulty row: {missing}")

    # 3. Reachability (ADR-029's first measured claim). Every word sits
    #    strictly inside the theta clamp, so no word is unschedulable by
    #    construction.
    conf = tuning()
    theta_min, theta_max = float(conf["theta_min"]), float(conf["theta_max"])
    unreachable = {w: d for w, d in table.items() if not theta_min < d < theta_max}
    if unreachable:
        errors.append(
            f"words outside the theta clamp ({theta_min}, {theta_max}), "
            f"unreachable by any reader: {unreachable}"
        )

    # 4. The ordering IS the frequency ordering (ADR-029's third measured
    #    claim). Sorting by difficulty ascending must equal sorting by Zipf
    #    descending -- the property the shell's "easiest useful word first"
    #    ordering rests on.
    from wordfreq import zipf_frequency

    by_difficulty = sorted(table, key=lambda w: (table[w], w))
    by_frequency = sorted(
        table, key=lambda w: (-zipf_frequency(w, "en", wordlist="best"), w)
    )
    if by_difficulty != by_frequency:
        first = next(
            i for i, (a, b) in enumerate(zip(by_difficulty, by_frequency)) if a != b
        )
        errors.append(
            f"difficulty order is not the frequency order; first disagreement at "
            f"position {first}: {by_difficulty[first]} vs {by_frequency[first]}"
        )

    # 5. A fresh reader has words to meet (ADR-029's second measured claim).
    #    theta = 0 is where every new reader starts; the band there must hold
    #    at least the passage's reserved seed slots, or a first passage seeds
    #    nothing. Checked across the range a reader actually occupies, not
    #    only at zero.
    for theta in (0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0):
        in_band = [
            w for w, d in table.items() if theta + BAND_LOW <= d <= theta + BAND_HIGH
        ]
        if len(in_band) < SEED_SLOTS_PER_PASSAGE:
            errors.append(
                f"only {len(in_band)} word(s) in the band at theta={theta}; "
                f"the composer reserves {SEED_SLOTS_PER_PASSAGE} seed slots per "
                f"passage and cannot fill them"
            )

    # 6. The band a fresh reader is served is not the whole lexicon. If it
    #    were, the mapping would be filtering nothing and the stand-in this
    #    replaced would be back in a different costume.
    fresh_band = [w for w, d in table.items() if BAND_LOW <= d <= BAND_HIGH]
    if len(fresh_band) >= len(table):
        errors.append(
            f"a fresh reader's band contains all {len(table)} words -- the "
            f"difficulty filter is not discriminating"
        )

    return errors


def main() -> int:
    errors = failures()
    for error in errors:
        print(f"FAIL: {error}", file=sys.stderr)
    if errors:
        return 1
    committed = json.loads(difficulty.OUT_PATH.read_text(encoding="utf-8"))
    print(
        f"ok: {len(committed['words'])} words, anchor Zipf "
        f"{committed['anchorZipf']} at rank {committed['anchorRank']}, "
        f"{committed['logitsPerZipf']} logit per Zipf unit"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
