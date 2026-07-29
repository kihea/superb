# The precision/coverage frontier table

ADVISORY-010 SS2's ruling on M2 item 5b: a bare precision floor "is a
coverage decision wearing a precision costume" — stating one number
silently picks how much of the teaching band gets discarded, and nobody had
made that choice on the record. This file is the receipt for
`frontier_table.py`'s run, so the floor Kihea's advisor is asked to ratify
rests on a shipped, reproducible table rather than a number typed into a PR
body.

**Regenerate:** `python data/pipeline/tests/frontier_table.py` (needs
`data/out/frequency.json` and `data/out/glosses.json` — see `glosses.py`'s
own docstring for how those are built). Raw output:
`data/pipeline/tests/frontier_table_result.json`.

## Method

For each frequency-rank floor, a gloss-overlap verdict only survives if its
*rarest* overlapping content word clears the floor — apposition and
definition-marker verdicts pass through untouched at every floor, because
PRECISION-STANDARD.md's own diagnosis is that the weakness is gloss-overlap
specifically (96.2% of all claims), not the other two signals.

- **Precision** is measured on the frozen, pooled hand-judged sample:
  `corpus_precision_sample.json`/`_key.json` (n=60, seed 20260725, before
  item 5b's fix) plus `corpus_precision_sample_after.json`/`_key_after.json`
  (n=40, seed 20260726, after the fix) — PR #40's own after-measurement
  found no statistically distinguishable shift between the two (50.0% vs
  45.0%, heavily overlapping intervals), so pooling them into one n=100 draw
  narrows the interval without manufacturing precision that isn't there.
  95% Wilson intervals throughout, matching PRECISION-STANDARD.md's own
  convention.
- **Band coverage** at ≥1 and ≥2 surviving excerpts, and **surviving
  claims**, are a census over the full, current 2,599-excerpt corpus — no
  sampling, no interval needed.

## The table

Pooled hand-judged sample: n=100 (60 before-fix + 40 after-fix, PR #40).
Corpus claim population: 5,704 (word, excerpt) pairs across 2,599 excerpt
files. Teaching band (rank 5,000–25,000): 20,001 words.

| rank floor | precision | n  | 95% CI          | ≥1 coverage | ≥2 coverage | surviving claims |
|-----------:|----------:|---:|:-----------------|------------:|------------:|-----------------:|
| 0          | 47.8%     | 92 | [37.9%, 57.9%]  | 14.1%       | 5.5%        | 5,610            |
| 500        | 52.1%     | 48 | [38.3%, 65.5%]  | 8.5%        | 2.3%        | 2,615            |
| 1,000      | 55.3%     | 38 | [39.7%, 69.9%]  | 6.7%        | 1.6%        | 1,896            |
| 2,000      | 57.7%     | 26 | [38.9%, 74.5%]  | 4.9%        | 0.9%        | 1,288            |
| 3,000      | 47.4%     | 19 | [27.3%, 68.3%]  | 3.6%        | 0.6%        | 908              |
| 5,000      | 42.9%     | 14 | [21.4%, 67.4%]  | 2.5%        | 0.4%        | 602              |
| 10,000     | 40.0%     | 10 | [16.8%, 68.7%]  | 1.7%        | 0.2%        | 374              |

(Floor 0 is the unmodified, shipped heuristic. n at floor 0 is 92, not 100:
8 of the pooled 100 claims no longer recompute as gloss-overlap-positive
against the current corpus/glosses — the same, small, honest drift
`measure_informativeness.py judge-corpus` already flags when a sample
predates the code it is re-scored against.)

## What this table says, plainly

**Raising the floor does not raise precision in a way this sample can
detect, and it does raise coverage's cost every time.** The point estimate
wobbles between 40% and 58% with no floor before it wobbles back down, and
every single row's 95% interval overlaps every other row's — none of the
seven measured points is statistically distinguishable from any other,
including floor 0. That is the frontier ADVISORY-010 §1 predicted: "no
threshold that raises the ceiling — only positions along one
precision/coverage frontier," now measured directly on the corpus rather
than inferred from PRECISION-STANDARD.md's earlier 28-claim spot check.

**Read against the stated 40% floor (PR #40, PRECISION-STANDARD.md), with
the interval — not just the point estimate — the honest answer is that no
row clears it.** Every measured floor's *lower* 95% bound sits below 40%
(16.8%–39.7% across the seven rows). The floor-2000 row looks the most
attractive on its point estimate (57.7%) but its own lower bound (38.9%) is
no higher than floor 0's (37.9%) — the appearance of improvement is sample
noise at n=26, not a measured gain. **This is ADVISORY-010 §4's
pre-registered outcome: no point on this frontier yields a subset both
above the stated floor and large enough to select against.** See this
track's PR body for what that means for issue #36 and the proposed next
step; this file states only the measurement, not the ruling.

**This table is under-powered to choose an operating point, full stop —
that is the finding, not a caveat on it.** Judged n shrinks fast as the
floor rises (92 → 48 → 38 → 26 → 19 → 14 → 10) and the intervals grow
correspondingly enormous — floor 2000's [38.9%, 74.5%] contains coin-flip
odds. ADVISORY-010 Directive 1 asked specifically for structural precision
at **n≈100+**, in writing, because the earlier 56% figure was small-sample
flattery and the project should not be fooled the same way in the opposite
direction. A table whose largest cell is 92 and whose decision-relevant
cells (any floor above 0) are 10–48 does not meet that bar. Enlarging the
judged sample per floor — drawing new claims, committing the key before
judging, hand-scoring under the standard — is real, separate work this PR
does not attempt; it ships the measurement and declines to choose a point
from it, rather than picking the best-looking cell in a table this
under-powered.

## A gap this table does not cover: the hand-picked lane

`content/sources/` holds 60 hand-authored excerpts (101 word claims, ADR-018's
separate contribution lane) alongside the 2,539 pipeline-generated ones. This
table's census reads every file's `words` uniformly, so those 101 claims sit
inside the 5,704-claim population above. But `is_informative()` was built
for, and only ever run against, the generated lane. Re-applied to the
hand-authored 101: **only 7 register under any known signal (1 apposition, 6
gloss-overlap); the other 94 score `none`** — consistent with ADR-026
Amendment 1's own finding (accepted the same day this table was measured)
that the algorithmic signals recognise almost nothing in that lane, and that
a fourth signal class, `hand-picked`, has been accepted to represent it but
has not yet migrated into the schema or this corpus.

This does not touch the precision numbers above — the pooled 100-claim
sample contains zero hand-authored excerpt ids, checked directly rather than
assumed. It does mean the coverage/surviving-claims columns currently fold
the hand-authored lane's 94 non-firing claims into "does not survive," when
the honest description is "was never subject to this heuristic to begin
with." Once ADR-026's migration lands, re-run this table with the
hand-picked lane reported as its own category, or excluded from the
gloss-overlap sweep's denominator entirely — a rank floor on gloss-overlap's
overlapping word has no meaning for a claim that was never selected via
gloss-overlap.
