# Does the pseudoword correction's rate-vs-per-observation question matter?

Written in PR #48 (`9af6396`), where it sat as an addendum at the foot of
`COVERAGE.md`. It was moved here whole when `tests/coverage_gate.rs` began
diffing `COVERAGE.md` against a fresh generator run: that file is now generated
output byte for byte, so hand-written prose cannot survive in it. This analysis
discharged a reviewed M2 done-check question, so it is kept intact here rather
than regenerated away.

Everything from the heading below is PR #48's text unchanged. Its figures were
measured against `dev` at `9f3fbda`, under the θ̂ standard error as it stood
before the estimator change in PR #52 — they record what was measured then, not
a claim about the current build, and they are deliberately not refreshed. The
finding they support is about the shape of the divergence, which the addendum's
own closing paragraphs state in words rather than in figures.

## Addendum — does the pseudoword correction's rate-vs-per-observation question actually matter? (M2 DONE item 4)

BRIEF-010 named an unresolved ambiguity: its own prose describes the pseudoword
correction as working from a "claim rate" in the current session, while
`ability::update_theta` actually applies a flat `-tuning.pseudoword_penalty`
per over-claimed pseudoword — a genuinely different mechanism from a rate,
since it accumulates once per observation rather than once per session, and
(unlike the Fisher-scored real-word step next to it) never shrinks as more
information accumulates. This addendum runs `pseudoword_comparison::run`
(already built for exactly this isolation, no new code) at six session
lengths, holding the real/pseudoword mix fixed at `calibration_real_rate =
0.7` — so only session length, not claim rate, varies — and reports the θ
gap between an over-claimer and an honest twin, 50 (seed, true-θ) pairs per
point:

Measured against `dev` at `9f3fbda`, 50 (seed, θ) pairs per row.
**The last column is seed-dependent at this sample size — see the note below
the long-end paragraph. The mean and min columns reproduce; that column does
not.**

| sessions | draws | expected pseudowords | mean gap | min gap | max gap | over-claimer at θ_min |
|---|---|---|---|---|---|---|
| 5 | 5 | 1.5 | 0.4651 | 0.0000 | 1.1715 | 0/50 |
| 20 | 20 | 6.0 | 1.5575 | 0.3708 | 3.1367 | 5/50 |
| 60 | 60 | 18.0 | 2.7757 | 0.8307 | 4.7145 | 23/50 |
| 240 (`REPORT.md`'s own horizon) | 240 | 72.0 | 3.9254 | 0.3684 | 7.5344 | 48/50 |
| 720 (3x horizon) | 720 | 216.0 | 3.9584 | 0.4084 | 7.5714 | 50/50 |
| 2000 | 2000 | 600.0 | 3.9796 | 0.3319 | 7.5190 | 50/50 |

**They diverge, and not by a small or academic amount, but the divergence
lives at the two ends of session length rather than in the middle where the
project's own default sits.**

At the **short** end (5–20 sessions, 1.5–6 expected pseudowords), the
per-observation mechanism can produce almost no correction at all — the
minimum gap at 5 sessions is exactly `0.0000`: a seed can draw zero
pseudowords in the whole session, in which case an over-claimer and an
honest learner with identical real-word evidence end up at *the same* θ,
regardless of what their claim rate would have been over a longer sample. A
genuine rate-based mechanism, keyed to an estimated over-claim proportion
rather than a raw count, would not have this failure mode — it could apply
some correction from a handful of observations the way a real-word Fisher
update already does from one. The per-observation mechanism cannot punish
over-claiming it has not yet sampled.

At the **long** end (≥240 sessions — the project's own default horizon, and
beyond), the gap does the opposite: it stops growing. It moves from 2.78
(60 sessions) to 3.93 (240) to 3.96 (720) to 3.98 (2000) — a session length
increase of over 8x past the default horizon buys essentially nothing
further, because the over-claimer's θ has already hit `theta_min`.

**How many pairs are clamped is seed-dependent at this sample size, and the
count should not be quoted as a property of the mechanism.** This run
measured 48 of 50 pairs clamped at 240 sessions and 50 of 50 by 720; an
independent reproduction of this addendum, same method and a disjoint seed
sample of the same size, measured 9 of 50 and 28 of 50. The rising trend is
the same in both and it is what this section rests on; the specific
proportion is not stable at n=50 and nothing here depends on it. Recorded
this way deliberately rather than pinned down with a bigger run — the
question this addendum was asked to answer does not need the number, and a
figure two honest runs disagree about should say so in the sentence that
contains it.

Unlike the real-word Fisher step, which
is *designed* to shrink as accumulated information grows (engine-contract
§5's own asymmetry), the pseudoword penalty never shrinks — it is the same
fixed `-0.3` on the thousandth over-claim as on the first — so what actually
bounds the gap is not the correction's own construction but the θ clamp
sitting downstream of it. A rate-based mechanism tied to the observed
proportion, not the count, would not necessarily saturate against the clamp
this way; whether it should is a design question, not this addendum's to
answer.

**Where it starts to matter:** between roughly 20 and 240 sessions — inside
this range the two mechanisms would visibly disagree about how much
correction is warranted for the same over-claim rate, because the
per-observation implementation is still accumulating linearly while a
rate-based one would already have "seen enough" to apply its full
correction. Below ~20 sessions the per-observation mechanism under-corrects
relative to a rate model (sometimes to zero); above ~240 it has already
exhausted its dynamic range against the clamp, and additional session length
changes nothing further about the divergence, only about how many learners
have already hit the floor.

**This does not reopen anything merged.** `ability::update_theta` is exactly
as built and exactly as tested — Assertion 4 (`REPORT.md`) and this module's
own unit tests already prove the qualitative claim ("an over-claimer ends
below an honest one") holds everywhere checked, including at the project's
own default horizon. What this addendum adds is the quantitative shape of
*how* that gap forms, and the answer to BRIEF-010's named question: the two
mechanisms are not the same, they were never obviously going to agree, and
now there is a measured account of where and how much they part ways, rather
than an open line in a ledger.
