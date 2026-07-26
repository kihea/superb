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
