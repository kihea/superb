# Attribution notices

Every one of these is a build-time dependency of `data/pipeline/`, never a
runtime one (`superb-core` has no I/O and no dependency on any of this —
`docs/engine-contract.md` §1). This file exists so the obligation that
survives past build time — an attribution a reader or a licensor could
reasonably ask to see — is written down once rather than re-derived from
source code comments. See `data/MANIFEST.md` for the dataset-by-dataset
licence ledger this file backs.

## wordfreq (frequency table, pseudoword real-word filter)

`wordfreq` is Robyn Speer's library, Apache License 2.0. Its English list
blends Google Books Ngrams, Wikipedia, the Leeds Internet Corpus,
OpenSubtitles, and the SUBTLEX-US word list.

Robyn Speer must be credited as **Robyn Speer** (her maiden name, used on
her academic work) — crediting her under any other name is, in her own
licence's words, "a serious violation."

SUBTLEX-US, created by Marc Brysbaert et al., is ordinarily CC BY-NC-SA —
which would put it on ADR-008's forbidden list. It clears this build only
because Robyn Speer obtained **written permission by e-mail from Marc
Brysbaert to redistribute it inside wordfreq for any purpose, not just
academic use**, conditioned on: wordfreq and code derived from it must
credit the SUBTLEX authors, and it must remain clear that SUBTLEX is freely
available data. This paragraph is that credit and that acknowledgement.

Google Books Ngrams data: "Ngram Viewer graphs and data may be freely used
for any purpose," with acknowledgement appreciated.

## WordNet (content/scripts/check_classes.py's substitution test)

Princeton WordNet 3.0. Custom permissive licence: "Permission to use, copy,
modify and distribute this software and database and its documentation for
any purpose and without fee or royalty is hereby granted," conditioned on
carrying the notice "WordNet 3.0 Copyright 2006 by Princeton University. All
rights reserved" and not using Princeton's name in advertising. Already on
ADR-008's allow-list by name.

## Wiktionary, via wiktextract (data/pipeline/glosses.py)

The extraction tool, `wiktextract` (Tatu Ylonen), is MIT-licensed code. The
extracted text is Wiktionary's own content and carries Wiktionary's licence:
**CC BY-SA 4.0, or GFDL, at the reader's choice** — a share-alike
obligation, deliberately accepted here per ADR-008's amendment ("Wiktionary
text is allowed only where the share-alike obligation is deliberately
accepted and recorded in the row").

**What the share-alike obligation requires downstream:** any gloss text
that reaches a build derived from Wiktionary must carry attribution to
Wiktionary contributors and, if modified, must be shared under a compatible
licence. This is why the app's About screen (a shell concern, not this
track's) must credit Wiktionary specifically wherever a gloss is shown,
per ADR-008.
