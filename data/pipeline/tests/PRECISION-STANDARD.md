# The informative-context judging standard

M2 contract item 5b's own history is the reason this file exists: the
corpus's first precision number (56%) was wrong not because anyone graded a
sample dishonestly, but because an evenly-stratified sample was read as a
corpus-wide estimate — a **sampling-frame** error, fixed by drawing the
`judge` sample as a uniform random pull over the shipped corpus's real word
claims instead of an equal split across the three signals (see
`corpus_precision_sample.json`'s method note). This file exists to close the
next available error in the same family, a **judging-standard** one: on the
same 60 claims, judging them once with no standard written down and once
against the sentence below moved the measured precision by nearly twelve
points (61.7% -> 50.0%, `corpus_precision_key.json`'s `_calibration_note`).
A floor stated without the standard it was judged against is unfalsifiable —
nobody six weeks from now could reproduce it, including the person who wrote
it.

## The standard

> Does the passage supply a real cue, or does it just fail to contradict
> what I already know?

Spelled out: a claim is **informative** only if a reader who has never seen
the word before could recover its meaning-as-used-here — not a vague
neighbourhood of meaning, the actual sense in play — from an **explicit or
strongly implicit cue** already in the 80-200 word window: a synonym or
restatement, an apposition, a stated contrast, a categorical list with named
members, or a functional definition. It fails the standard if the passage is
merely *consistent with* the word's real meaning — thematically coherent,
correctly used, grammatically unremarkable — without actually explaining it.
Coherence is true of almost every sentence a fluent writer produces; it is
not evidence of teaching.

The failure mode this standard exists to catch is a fluent reader's own
first instinct, documented because it is exactly what happened on the first
pass over this same sample: an already-fluent judge credits a passage as
informative whenever nothing in it contradicts the meaning they already
carry in from outside the text. That is not context doing the teaching; it
is the judge's own prior knowledge doing it, silently, and the judge cannot
tell the difference from the inside without a standard to check against.

## Worked examples, both sides of the line

**Informative — a real cue is present:**

- `barrel` / *Robinson Crusoe*: "...happened to open the **barrel** of
  powder... near sixty pounds of very good powder in the centre of the
  **cask**." An explicit synonym (cask) is supplied for the claimed word.
- `sandy` / *Robinson Crusoe*: "...all of a **sandy**, crumbling stone...
  nor would break the corn without filling it with **sand**." The root is
  restated directly.
- `landmark` / *The Legend of Sleepy Hollow*: "...towered like a giant above
  all the other trees... and formed a kind of **landmark**." An apposition
  clause states what the word denotes.
- `necessity` / *Life on the Mississippi*: "...always find it **necessary**
  to run down to Cairo... or some other **necessity**." Same root,
  restated — a synonym relationship the reader can use without already
  knowing the word.
- `compliment` / *Gulliver's Travels*: "This is the **compliment**,
  established by the laws of the land, for all persons admitted to the
  king's presence" — followed by the ritual phrase itself and its literal
  translation. As explicit a definition as prose gets.

**Not informative — the passage is merely consistent with the word, not
explanatory of it:**

- `lad` / *The Picture of Dorian Gray*: "...The **lad** was touched. He
  went towards her..." `lad` is simply a second reference to a character
  already established; nothing in the passage supplies "young man."
- `hammer` / *The Legend of Sleepy Hollow*: "...a head like a **hammer**."
  A simile assumes the reader already knows what a hammer is; it explains
  nothing to a reader who does not.
- `resurrection` / *The House of the Seven Gables*: "...his morrow will be
  the **resurrection** morn." Used correctly, in the right sense, with no
  cue at all — the passage relies entirely on knowledge the reader brings.
- `dashed` / *Cranford*: "...A.M. twice **dashed** under..." — the intended
  sense is "underlined," a rare sense that competes with the far more
  available "rushed." Nothing in the passage favours the correct reading
  over the wrong, more common one; a naive reader is likelier to guess
  wrong than right. (This is the sense-selection defect this track's fix
  targets, one layer down: even a *correct* gloss lookup wouldn't rescue a
  passage that gives the reader no way to prefer the right sense.)
- `tommy` / *The Secret Adversary*: "**Tommy** Beresford was one of those
  young Englishmen..." This is not a wrong sense — it is not a vocabulary
  claim at all. The claimed token is a character's given name that happens
  to spell a common dictionary headword (`tommy`, informal for "British
  soldier"); the excerpt never uses that sense, or any sense — it uses a
  name. A **candidacy** failure, upstream of gloss quality entirely.

## What this sample says about where the false claims come from

Classifying all 30 claims my strict-standard judgment rejected, from the
same `corpus_precision_sample.json` pull (n=60, uniform over the real
corpus, ≈96% of which is gloss-overlap-gated per the contract's own
incidence count):

| class | count | share of false claims |
|---|---|---|
| not a vocabulary instance at all (proper-noun homograph, `tommy`'s family) | 1 | 3.3% |
| wrong dictionary sense selected (`dashed`'s family, same as the diagnosed `shook`) | 1 | 3.3% |
| right word, right sense, but the passage supplies no real cue | 28 | 93.3% |

This breakdown is **provisional** — it is read off the text and my own
sense of which meaning is "obviously" in play, not off the actual gloss the
heuristic consulted, because `data/out/glosses.json` had not finished
rebuilding when this file was first written. It will be corrected against
the real per-claim gloss once available, and the corrected numbers land in
the PR body rather than here.

If the provisional split holds even roughly, it is the honest, load-bearing
finding of this track: **the diagnosed lever (word-sense selection) is real
and worth fixing, but on this evidence it is not the dominant source of
false claims.** The gloss-overlap signal's core weakness is structural, not
a data-quality bug — it detects topical/lexical proximity between a
sentence and a dictionary sense, and proximity is a much weaker bar than
"the sentence teaches the meaning." Fixing which sense gets picked helps the
first two rows and leaves the third untouched. The stated floor below has
to be honest about that ceiling.

## The interval, not the point

At n=60, a measured precision of *p* carries a 95% confidence half-width of
roughly `1.96 * sqrt(p(1-p)/60)`. At p=0.50 that is **±12.6 points** (37.3%
to 62.7%). The corpus's own recorded ≈44% and this sample's 50.0% are **not
distinguishable** at this sample size — the two numbers agree, they do not
merely fail to disagree loudly. Any precision figure quoted from a
60-sample judging pass must carry this interval; a bare point estimate is a
number wearing a decimal point it has not earned.

## After the fix: what moved, and what did not

`data/pipeline/glosses.py` now resolves an inflected surface form (`shook`,
`dashed`, ...) to its lemma's own sense when wiktextract marks it `form-of`/
`alt-of`, instead of falling through to whichever unrelated homograph
happens to sit earlier in the snapshot — see `glosses.py`'s
`redirect_target` docstring for the full reasoning and `test_glosses.py`
for the regression this fix is graded against. The corpus was regenerated
in full (`python data/pipeline/excerpts.py --per-book-cap 20`, matching the
original build) against the corrected glosses.

A second uniform sample (n=40, seed 20260726, distinct from this file's
frozen n=60 baseline above), judged by hand against the same standard,
against `corpus_precision_key_after.json`:

- **18/40 = 45.0% informative**, 95% CI roughly 29.6%–60.4%.
- This overlaps almost completely with the before-fix interval (37.3%–
  62.7%). **No statistically distinguishable change in headline
  precision.**
- Band coverage moved slightly the right direction: 2+ excerpts 4.8% → 5.5%,
  1 excerpt 6.7% → 8.7%, 0 excerpts 88.5% → 85.8% — a side effect of 22,650
  of 30,000 target words now resolving to *some* correct gloss, against
  18,452 before (more words correctly glossed, not merely fewer glossed
  wrong).
- The fix does verifiably close the diagnosed case: `dashed` — this file's
  own worked example of a wrong-sense claim competing with a more available
  sense — no longer registers as a gloss-overlap candidate at all under the
  corrected code, confirming the mechanism works on the failure it targets.

**Why the headline number does not move even though the mechanism works.**
This file's own provisional breakdown (above) already predicted it: the
wrong-sense failure was ~7% of false claims (2/30) on the before-sample; the
dominant failure (~93%, 28/30) is gloss-overlap treating topical/lexical
proximity as if it were explanation — a *sense-correct*, coherent use with
no actual teaching cue (`ceiling`, `growl`, `lamp`, `nearest` in the
after-sample: ordinary words, right sense, nothing wrong to fix, nothing
explaining them either). Fixing which sense gets picked cannot repair a
claim whose defect was never the sense.

**Two further levers considered and measured, not shipped — recorded so
they are not re-proposed at full price:**

1. **Restrict gloss-overlap to a local window near the candidate word**,
   mirroring how apposition/definition-marker are already forward-window
   restricted. Measured directly against the before-sample's 28 rejected
   gloss-overlap claims and their true-positive counterparts: **13/28 (46%)
   of false claims** have their overlapping word within 100 characters of
   the candidate — but so do **13/28 (46%) of true positives** (this file's
   own `compliment` example supplies its cue 450 characters away, well
   outside any tight window a real definition-carrying sentence needs). A
   locality cutoff removes true and false claims at a statistically
   indistinguishable rate — the same cliff-not-dial shape as the two
   already-refuted cross-signal plans, measured before anything was built.
2. **A structural rewrite of gloss-overlap into a stronger cue detector**
   (e.g. requiring the overlap to sit inside an explanatory clause, not
   merely anywhere in the window) is plausible and likely the real fix —
   but it is a signal redesign, not a pipeline bug fix, and is out of this
   track's scope. Named as the honest next lever, not attempted here.

**The floor this track states: 40% informative-context precision**, stated
with its reasoning rather than as a round number:

- It sits below both measured intervals' lower bounds (37.3% before, 29.6%
  after) at the sample sizes measured here, so it is a floor the corpus can
  be checked against without a wider sample first — a floor above what has
  actually been measured would be unfalsifiable at this n.
- It is **not** a claim that the fix raised precision to a new plateau —
  the honest reading of both samples is that precision did not move in a
  way this instrument can detect. The floor states what the corpus can
  currently be held to, not a target achieved.
- **Item 5b's tripwire should not be disarmed on this floor.** The
  dominant failure mode — coherent, correctly-sensed claims with no real
  teaching cue — is unaddressed by any change authorized in this track's
  scope, and the two candidate fixes for it (above) are either a measured
  cliff or a genuine redesign. `Candidate.words` is more honestly measured
  than before this PR, and one real, verified defect closed — but "more
  honestly measured" is not "measured above a floor a scheduling consumer
  should trust." That is this PR's answer to the DONE clause's own
  question, stated plainly rather than implied by a number.
