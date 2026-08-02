# Data manifest

The enforced ledger ADR-008 requires: every dataset a build touches gets a
row here, naming its source, licence, and what it is used for. CI
(`.github/workflows/data-license.yml`) fails the build if a dataset is used
without a row, or if a row names a licence on the forbidden list. See
`data/NOTICE.md` for the full attribution text each row below is required to
carry downstream.

**Forbidden, permanently, in any build, while any paid tier exists, absent
written permission:** SWOW-EN (CC BY-NC-ND) and the USF free-association
norms (all rights reserved). Neither appears below and neither may be added
without amending ADR-008 first.

**Individual sourced excerpts** (`content/sources/*.json`) are not rows in
this table — each one carries its own complete `provenance` record instead,
checked by `content/scripts/check_sources.py` and CI against the allow-listed
origins ADR-018 names (Standard Ebooks, Project Gutenberg, Wikisource). This
table covers only the reference datasets `data/pipeline/` builds from.

| Dataset | Source | Licence | URL | Retrieved | Used for |
|---|---|---|---|---|---|
| wordfreq | Robyn Speer (Apache-2.0 code); blends Google Books Ngrams, Wikipedia, Leeds Internet Corpus, OpenSubtitles, and SUBTLEX-US | Apache-2.0 (code); SUBTLEX-US component cleared for any use by Marc Brysbaert's written permission to the author, credit required — see `data/NOTICE.md` | https://github.com/rspeer/wordfreq | 2026-07-25 | `data/pipeline/frequency.py` — the frequency table (`data/out/frequency.json`) that names the 5,000-25,000 teaching band; also the real-word filter in `data/pipeline/pseudowords.py`; and `data/pipeline/difficulty.py` — the word-to-difficulty table (`content/difficulty.json`, ADR-029), which maps each slot-lexicon word onto the engine's ability scale so a new reader's first passage is drawn by difficulty rather than by filename order. That table ships in the app: it carries rounded values (the slot-class lexicon, the sourced-excerpt target words, and the challenge prompt words) derived from this same list, under the attribution `data/NOTICE.md` already records, and adds no licence surface this row did not already state. The same Zipf frequencies also grade and rank the challenge data built by `data/pipeline/rhymes.py` and `data/pipeline/associations.py` |
| WordNet 3.0 | Princeton University | Custom permissive (free use, copy, modify, distribute; must carry the WordNet copyright notice) | https://wordnet.princeton.edu/ | 2026-07-25 (scope widened 2026-08-02) | `content/scripts/check_classes.py` — the slot-class substitution test (build/test tool); and `data/pipeline/associations.py` — the association challenge data (`content/challenges/association.json` and `association-index.json`), which **ships**: every associate's relation (synonym, antonym, kind-of, part-of, made-from, same-root) is derived from WordNet, so the required copyright notice in `data/NOTICE.md` must be carried wherever that data reaches a reader (Settings → About) |
| Wiktionary, via `wiktextract` | English Wiktionary contributors, extracted by Tatu Ylonen's `wiktextract` (MIT code), published by kaikki.org | CC BY-SA 4.0 or GFDL (reader's choice) — share-alike obligation deliberately accepted per ADR-008's amendment | https://kaikki.org/dictionary/English/ | 2026-08-01 | `data/pipeline/glosses.py` — raw dictionary glosses (`data/out/glosses.json`), rewritten and panel-reviewed downstream (ADR-012) before anything reaches a reader; attribution to Wiktionary is required wherever a gloss surfaces (Settings → About, now carrying it). Also consulted, read-only, by `data/pipeline/excerpts.py`'s "gloss-overlap" informativeness signal — the gloss text itself never ships from that path; it only helps decide whether an excerpt's own sentence already explains a word, so it carries no separate share-alike surface beyond the one this row already states. Slice 1A (PLAN.md §7) ships one book-scoped cut of this table, `content/glosses/bram-stoker_dracula.json` (6,256 of Dracula's 9,645 distinct words, the rest outside the pipeline's 30,000-word frequency band) — mechanically normalized only (capitalization, a closing period), **not** the ADR-012 plain-language rewrite or thorny-case panel review that gate is required to pass before a gloss table is considered ready; tracking issue: https://github.com/kihea/superb/issues/117 |
| Pseudoword generator | Original — an English syllable/phonotactics model written for this project; no external dataset | N/A (no third-party content; only `wordfreq`'s word list is consulted, to confirm a generated form is *not* a real word) | — | 2026-07-25 | `data/pipeline/pseudowords.py` — the calibration list (`data/out/pseudowords.json`) used to correct for guessing, per `docs/engine-contract.md` |
| CMU Pronouncing Dictionary (CMUdict) | Carnegie Mellon University, fetched raw from the cmusphinx GitHub repository at pinned commit `74790861f652b15e4ac49015a90074ad62a27690`. The pypi package named `cmudict` is deliberately NOT used: its wrapper code is GPL-3.0, which this project bans — the raw file at a pinned commit carries only CMU's own licence | BSD 2-clause style (free use and redistribution, source or binary, provided the copyright notice and conditions are carried along) — full text in `data/NOTICE.md` | https://github.com/cmusphinx/cmudict | 2026-08-02 | `data/pipeline/rhymes.py` — the rhyme challenge data, which **ships**: `content/challenges/rhyme-prompts.json` (prompts with their exact and near rhymes) and `content/challenges/pronunciations.json` (word → rhyme keys for judging typed answers). Both are derived from CMUdict pronunciations, so the notice in `data/NOTICE.md` must be carried wherever this data reaches a reader (Settings → About) |
| Co-occurrence counts (own corpus) | Original — windowed co-occurrence (PMI) computed by `data/pipeline/associations.py` over this repository's own sourced excerpts (`content/sources/*.json`, each carrying its own public-domain provenance record); no external association norms of any kind | N/A (derived entirely from the public-domain corpus above; the forbidden association datasets named at the top of this file are not consulted) | — | 2026-08-02 | `data/pipeline/associations.py` — the corpus half of the association challenge data: the "shows up beside it" connections and the PMI part of each associate's ranking |
| Book library (whole books) | [superb-catalogue/library](https://github.com/superb-catalogue/library) — Standard Ebooks and Project Gutenberg editions ingested with a per-book provenance record | Public domain / CC0 per book, as each book's own `provenance.json` in that repository states; nothing enters the library without checkable terms | https://github.com/superb-catalogue/library | 2026-08-02 | `data/pipeline/catalogue_index.py` — the app-facing catalogue index (`content/catalogue/index-v1.json`: titles, authors, categories, first lines), which **ships**; the book text itself is fetched by the app at read time from that repository and never copied into this one |
| Wiktionary full English extract (whole-dictionary cut) | Same source as the Wiktionary row above — kaikki.org's full English JSONL, downloaded once and kept outside this repository | CC BY-SA 4.0 or GFDL (reader's choice), same acceptance as the row above | https://kaikki.org/dictionary/English/ | 2026-08-02 | `data/pipeline/book_glosses.py` — per-book gloss tables (`content/glosses/<book-id>.json`) covering each book's own vocabulary without a frequency-band ceiling, plus the games' table (`content/challenges/glosses.json`) and the composed-prose table (`content/glosses/prose.json`). All **ship**, so Wiktionary's attribution and share-alike terms travel with them (Settings → About) |
| Sourced excerpts (literary corpus, at scale) | Project Gutenberg only, this run (Standard Ebooks and Wikisource are ADR-018 allow-listed but not wired up — see the PR body) | Public Domain (US: published before 1929) — the same basis every excerpt's own `provenance.licence` states, checked per work by `check_license_gate.py` against the `year` in the same record. Project Gutenberg's copyright clearance is why these texts were *available*; publication before 1929 is why they are public domain, and it is the half a stranger can verify from the record alone | https://www.gutenberg.org/ | 2026-07-25 | `data/pipeline/excerpts.py` — fetches, segments, and scores candidate excerpts from `BOOK_CATALOG`; this row exists so `check_license_gate.py`'s "every pipeline script has a manifest row" rule has one to find, not because individual excerpts are catalogued here — they are not (see the note above the table) |

## Content licence

The passage library (`content/passages/`) and the slot classes
(`content/classes/`) are released **CC0** — the project owns the
infrastructure that serves this content, not the content itself (ADR-008
amendment). Attribution is welcomed and never required.

Rewritten glosses are not CC0: they start from the Wiktionary row above, so
they carry Wiktionary's credit and share-alike terms downstream, whenever a
gloss reaches a build (Settings → About), exactly as that row already
states. This paragraph previously listed "any rewritten glosses that ship"
alongside the CC0 content — corrected while building the licence-claims
gate (`data/pipeline/check_license_claims.py`), which found this section
disagreeing with the Wiktionary row three lines above it. The wrong sentence
never had a live reader-facing consequence, because `data/pipeline/glosses.py`
has not shipped output yet, but it was already the wrong answer to a question
this file exists to answer correctly.
