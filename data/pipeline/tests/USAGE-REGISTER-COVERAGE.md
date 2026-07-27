# The usage-register coverage screening

ADVISORY-012 §3: the last live path by which ADVISORY-010's standing
falsifier could still fire. `usage_register_probe.py`'s sample was drawn
from the corpus's own claims, so 45 of its 46 fires sat inside
gloss-overlap's own fires -- it could only ever demote a claim the old
signal had already made, never discover a new one. The coverage question --
**would comparing against example sentences find different words
entirely?** -- had never been tested. This file is the receipt for both
steps ADVISORY-012 §3 authorised.

## Step 1 -- the screening (script only, no judging)

**Regenerate:** `python data/pipeline/tests/usage_register_coverage_screen.py
<path-to-kaikki-dump.jsonl>`. Raw output:
`usage_register_coverage_result.json`.

For every band word actually present in every excerpt's own text (not just
the words the current pipeline already claims), check whether it is
already in that excerpt's `words` list. For the ones that are not, check
whether usage-register overlap (the word's winning gloss's matched sense's
example sentences, content-word-overlapping the excerpt's own sentence)
would fire.

| | count |
|---|---:|
| Not-currently-claimed candidate population | 22,866 (word, excerpt) pairs |
| Distinct candidate words | 6,607 |
| No gloss at all | 2,044 |
| Gloss but no usage example in this snapshot | 3,144 |
| Measurable (had both) | 17,678 |
| **New fires** (usage-register overlaps, current pipeline does not claim) | **9,114 (51.6% of measurable)** |
| Distinct words involved in a new fire | 3,271 |

**This count is material, by any reading.** Comparing against example
sentences finds a population of candidate claims nearly twice the size of
the corpus's current 5,704-claim population -- these are not the same
words the old signal already touches; 9,114 of them are ones it currently
scores `none`. Step 2 follows.

## Step 2 -- the hand-judged sample

A uniform random sample of 60 (seed 20260727) was drawn from the
**complete** 9,114-entry new-fire population -- not a pre-capped subset --
via `draw_usage_coverage_sample.py`. The sample was committed blind (word,
excerpt text, work title; no overlap words, no verdict) before
`usage_coverage_key.json` was written. Key and scoring:
`python data/pipeline/tests/score_usage_coverage.py`.

**Result: 27/60 = 45.0% informative, 95% Wilson CI [33.1%, 57.5%].**

The key's own `_calibration_note` records a real first-pass correction:
an initial read scored 29/60 (48.3%), and rereading against
`PRECISION-STANDARD.md`'s own "hammer" worked example -- a simile assumes
the reader already knows the vehicle concept and explains nothing --
caught three claims (`drunken`/"reeled like a drunken giant",
`curtain`/"a curtain of tangled sprays and branches", `delightful`/paired
only with the equally unexplained "delicious") using the candidate word as
the *already-known* reference term rather than the word being taught.
Reversed to not-informative on rereading, landing at 27/60. The same
first-pass-too-generous pattern the standard's own author documented on the
frozen gloss-overlap sample (61.7% → 50.0%) reproduced itself here, which is
recorded because the correction is the finding, not a footnote.

## What this says

**The new-fire population is real and substantial in volume, and its
reliability sits in the same band as everything else measured on this
track.** 45.0% is close to the shipped heuristic's own floor-0 precision
(47.8%, `FRONTIER-TABLE.md`) and to the original usage-register probe's
result on already-claimed words (53.2%, `USAGE-REGISTER-PROBE.md`) -- none
of the three is statistically distinguishable from the others at these
sample sizes.

**Read against the stated 40% floor with the interval included -- the same
standard every other measurement on this track is held to -- this does not
clear it either.** The lower bound, 33.1%, sits below 40%, the same shape
as every row of the gloss-overlap frontier and the original probe.

**So: the coverage half of ADVISORY-010's standing falsifier is answered,
and it does not fire.** Comparing against example sentences does find
thousands of different words the current signals miss -- that part of the
falsifier's premise is confirmed, and it is a real, useful finding on its
own. But the words it finds are not more reliable than what the corpus
already has; they carry the same roughly-coin-flip precision, with the same
wide interval, as everything else on this frontier. A new signal earns a
reopened scale question only by clearing the floor with its interval
(ADVISORY-012 §3) -- this one does not, so nothing here authorises an
operating point, a corpus-size target, or a new excerpt. The falsifier is
dead on both halves now: not the comparison register's fault (precision,
`USAGE-REGISTER-PROBE.md`), and not a hidden reserve of untapped reliable
words either (coverage, this file).
