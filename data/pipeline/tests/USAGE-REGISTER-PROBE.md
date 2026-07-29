# The usage-register probe

ADVISORY-010 §1's standing falsifier over the whole scale question: is the
measured precision ceiling **the comparison register's fault** (gloss-overlap
compares a passage against Wiktionary's *definition-writing* register — a
dictionary's own vocabulary, not language about the word) or **overlap as a
mechanism's fault**? Wiktionary entries also carry *example sentences* —
usage-register text, same source (kaikki.org), same licence, already covered
by `data/MANIFEST.md`'s existing Wiktionary row (no new dataset enters the
build). This probe swaps the comparison register and re-runs the identical
overlap-and-hand-key measurement, on the same frozen 100-claim pooled sample,
under the same `PRECISION-STANDARD.md` standard.

**Regenerate:** `python data/pipeline/tests/usage_register_probe.py
<path-to-kaikki-dump.jsonl>` (or `--fetch` for kaikki.org's per-word pages,
if no local dump is on hand). Raw output:
`data/pipeline/tests/usage_register_result.json`.

## Method

For each of the pooled sample's 100 (word, excerpt) claims: look up the
word's *winning gloss* — the same sense `glosses.py` picked for it, so this
probe compares against the usage text for the sense excerpts.py's
gloss-overlap signal already consults, not a different, easier sense — find
that sense's Wiktionary example sentences, and check for content-word
overlap with the excerpt's own sentence, exactly as `is_informative`'s
gloss-overlap branch does, just against usage text instead of gloss text.
Precision is then measured against the same frozen hand key.

## Result

- 100 pooled claims. 3 have no gloss at all (unglossed target words); 18
  have a gloss but the matched sense carries no example sentences in this
  Wiktionary snapshot. **79 of 100 claims could actually be measured.**
- Usage-register overlap fired on **47 of the 79** measured claims.
- Precision (hand key agrees): **25/47 = 53.2%**, 95% Wilson CI **[39.2%,
  66.7%]**.

## Does it beat the frontier?

**No — not in a way this instrument can detect, and it does not clear the
stated 40% floor either, on the same interval-inclusive reading
`FRONTIER-TABLE.md` applies to the gloss-overlap sweep.**

The usage-register point estimate (53.2%) is numerically the highest single
number either measurement produced, but its interval [39.2%, 66.7%] overlaps
almost entirely with the shipped heuristic's own floor-0 interval (47.8%,
[37.9%, 57.9%]) — the same "cannot distinguish at this n" shape
`PRECISION-STANDARD.md` already documented between its own before-fix and
after-fix samples (50.0% vs 45.0%). And its own lower bound, 39.2%, sits
(barely) below the stated 40% floor, same as every row of the gloss-overlap
frontier.

**Read plainly: swapping the comparison register does not resolve
ADVISORY-010's open question.** The diagnosis that the *definition-writing*
register is specifically at fault is not confirmed by this measurement —
the numbers move in the hoped-for direction but not by an amount this
sample can tell apart from noise. It also surfaces a coverage problem of its
own: usage-register comparison is only *measurable at all* on 79% of claims
(21% of sampled words have no example sentence attached to their winning
sense in this snapshot), a real cost a corpus-wide switch to this register
would have to price in, on top of not yet showing it clears the floor.

This does **not** trigger ADVISORY-010's "supersede this ruling" clause —
that clause fires only if the probe *beats* the frontier, and on this
measurement it does not.
