# The precision/coverage frontier table

**Measured 2026-07-29, against `47aa0ae` (dev, after PR #64's corpus
repair) — 5,096 excerpts, up from the 2,599 this table was last measured
against.** Regenerating this run also surfaced two pre-existing bugs in
`frontier_table.py`, unrelated to the corpus size and present since the
file was first generated: `corpus_claims()` read each excerpt's `words`
field as a bare string, when it has held `{"word": ..., "signals": [...]}`
dicts since before this file's first commit (2b49451) — confirmed by
running the unpatched script against that commit's own corpus and getting
the identical crash; and `survives()` compared `is_informative`'s reason
against the string `"gloss-overlap"`, when `is_informative` has returned a
list of every fired signal since ADR-026, so the rank-floor sweep silently
never filtered anything (every floor read identical to floor 0) until
fixed. Both are now fixed in the script. Precision (the frozen hand-judged
sample) is unaffected by either bug or by corpus size; the coverage and
surviving-claims columns below are the corrected, freshly measured numbers.

**Provenance of the previous, 2,599-excerpt table: settled, not just
flagged.** Running the repaired script against 2b49451's own corpus
reproduces every number that commit's version of this file reported,
byte-for-byte (coverage and surviving-claims columns included). So the
previous table was never wrong — it could only have been produced by a
version of the script with these two fixes already applied locally, and
that fix never landed in the committed file. The number that reader relied
on was correct; the instrument that was supposed to be able to reproduce it
on demand was not. As always, treat this table as pinned to the commit
named above.

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
  claims**, are a census over the full, current 5,096-excerpt corpus — no
  sampling, no interval needed.

## The table

Pooled hand-judged sample: n=100 (60 before-fix + 40 after-fix, PR #40).
Corpus claim population: 9,833 (word, excerpt) pairs across 5,096 excerpt
files. Teaching band (rank 5,000–25,000): 20,001 words.

| rank floor | precision | n  | 95% CI          | ≥1 coverage | ≥2 coverage | surviving claims |
|-----------:|----------:|---:|:-----------------|------------:|------------:|-----------------:|
| 0          | 47.8%     | 92 | [37.9%, 57.9%]  | 14.4%       | 7.0%        | 7,904            |
| 500        | 52.1%     | 48 | [38.3%, 65.5%]  | 10.0%       | 4.0%        | 4,026            |
| 1,000      | 55.3%     | 38 | [39.7%, 69.9%]  | 8.5%        | 3.0%        | 3,025            |
| 2,000      | 57.7%     | 26 | [38.9%, 74.5%]  | 6.8%        | 1.9%        | 2,124            |
| 3,000      | 47.4%     | 19 | [27.3%, 68.3%]  | 5.5%        | 1.3%        | 1,569            |
| 5,000      | 42.9%     | 14 | [21.4%, 67.4%]  | 4.4%        | 0.9%        | 1,148            |
| 10,000     | 40.0%     | 10 | [16.8%, 68.7%]  | 3.2%        | 0.4%        | 760              |

(Precision, n, and the 95% CIs are unchanged from the previous, 2,599-excerpt
measurement of this table — the judged sample is frozen and does not move
with corpus size. Coverage and surviving claims rose at every floor as the
corpus roughly doubled, by somewhat more than double at most floors — e.g.
floor 0's surviving claims went from 5,610 to 7,904 (1.4x) while the corpus
went from 2,599 to 5,096 excerpts (2.0x) is the smallest ratio in the table;
floor 10,000 rose from 374 to 760 (2.0x). This is a measurement, not a
finding this file interprets further.)

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

`content/sources/` now holds 54 hand-authored excerpts (93 word claims,
ADR-018's separate contribution lane) alongside the 5,042 pipeline-generated
ones — down from 60 excerpts/101 claims at the previous measurement; PR #64's
corpus repair rebuilt the pipeline-generated lane from real character offsets
and evidently touched some hand-authored files too, though this file does not
trace which ones or why (that is real, separate work, not attempted here).
This table's census reads every file's `words` uniformly, so those 93 claims
sit inside the 9,833-claim population above. But `is_informative()` was built
for, and only ever run against, the generated lane. Re-applied to the
hand-authored 93: **only 6 register under any known signal (1 apposition, 5
gloss-overlap); the other 87 score `none`** — consistent with ADR-026
Amendment 1's own finding that the algorithmic signals recognise almost
nothing in that lane, and that a fourth signal class, `hand-picked`, has been
accepted to represent it but has not yet migrated into the schema or this
corpus.

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
