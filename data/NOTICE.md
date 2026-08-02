# Attribution notices

Every one of these is a build-time dependency of `data/pipeline/`, never a
runtime one (`superb-core` has no I/O and no dependency on any of this —
`docs/engine-contract.md` §1). This file exists so the obligation that
survives past build time — an attribution a reader or a licensor could
reasonably ask to see — is written down once rather than re-derived from
source code comments. See `data/MANIFEST.md` for the dataset-by-dataset
licence ledger this file backs.

Two of the datasets below now produce shipped content, not just build-time
checks: CMUdict (the rhyme challenge data) and WordNet (the association
challenge data). Their notices must be carried wherever that content
reaches a reader — Settings → About, alongside the Wiktionary credit.

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

## WordNet (association challenge data; also check_classes.py's substitution test)

Princeton WordNet 3.0. Custom permissive licence: "Permission to use, copy,
modify and distribute this software and database and its documentation for
any purpose and without fee or royalty is hereby granted," conditioned on
carrying the notice "WordNet 3.0 Copyright 2006 by Princeton University. All
rights reserved" and not using Princeton's name in advertising.

WordNet now produces shipped content: the association challenge data
(`content/challenges/association.json` and `association-index.json`, built
by `data/pipeline/associations.py`) derives every named relation — synonym,
opposite, kind-of, part-of, made-from, same-root — from WordNet 3.0. The
notice above must therefore appear wherever that data reaches a reader
(Settings → About).

## CMU Pronouncing Dictionary (rhyme challenge data)

CMUdict, fetched raw from the cmusphinx GitHub repository at a pinned
commit (see `data/MANIFEST.md`). It powers `data/pipeline/rhymes.py`, whose
outputs ship: `content/challenges/rhyme-prompts.json` and
`content/challenges/pronunciations.json`. The licence is BSD 2-clause
style; its notice, which must be carried with redistributions and so must
reach the app's Settings → About:

> Copyright (C) 1993-2015 Carnegie Mellon University. All rights reserved.
>
> Redistribution and use in source and binary forms, with or without
> modification, are permitted provided that the following conditions
> are met:
>
> 1. Redistributions of source code must retain the above copyright
>    notice, this list of conditions and the following disclaimer.
>    The contents of this file are deemed to be source code.
>
> 2. Redistributions in binary form must reproduce the above copyright
>    notice, this list of conditions and the following disclaimer in
>    the documentation and/or other materials provided with the
>    distribution.
>
> This work was supported in part by funding from the Defense Advanced
> Research Projects Agency, the Office of Naval Research and the National
> Science Foundation of the United States of America, and by member
> companies of the Carnegie Mellon Sphinx Speech Consortium. We acknowledge
> the contributions of many volunteers to the expansion and improvement of
> this dictionary.
>
> THIS SOFTWARE IS PROVIDED BY CARNEGIE MELLON UNIVERSITY ``AS IS'' AND
> ANY EXPRESSED OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
> THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
> PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL CARNEGIE MELLON UNIVERSITY
> NOR ITS EMPLOYEES BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
> SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
> LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
> DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
> THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
> (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
> OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

The pypi package named `cmudict` wraps this same data in GPL-3.0 code; it
is deliberately not used, so no GPL enters the dependency tree.

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
