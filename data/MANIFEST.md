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
| wordfreq | Robyn Speer (Apache-2.0 code); blends Google Books Ngrams, Wikipedia, Leeds Internet Corpus, OpenSubtitles, and SUBTLEX-US | Apache-2.0 (code); SUBTLEX-US component cleared for any use by Marc Brysbaert's written permission to the author, credit required — see `data/NOTICE.md` | https://github.com/rspeer/wordfreq | 2026-07-25 | `data/pipeline/frequency.py` — the frequency table (`data/out/frequency.json`) that names the 5,000-25,000 teaching band; also the real-word filter in `data/pipeline/pseudowords.py` |
| WordNet 3.0 | Princeton University | Custom permissive (free use, copy, modify, distribute; must carry the WordNet copyright notice) | https://wordnet.princeton.edu/ | 2026-07-25 | `content/scripts/check_classes.py` — the slot-class substitution test (build/test tool, not shipped content) |
| Wiktionary, via `wiktextract` | English Wiktionary contributors, extracted by Tatu Ylonen's `wiktextract` (MIT code), published by kaikki.org | CC BY-SA 4.0 or GFDL (reader's choice) — share-alike obligation deliberately accepted per ADR-008's amendment | https://kaikki.org/dictionary/English/ | 2026-07-25 | `data/pipeline/glosses.py` — raw dictionary glosses (`data/out/glosses.json`), rewritten and panel-reviewed downstream (ADR-012) before anything reaches a reader; attribution to Wiktionary is required wherever a gloss surfaces (Settings → About) |
| Pseudoword generator | Original — an English syllable/phonotactics model written for this project; no external dataset | N/A (no third-party content; only `wordfreq`'s word list is consulted, to confirm a generated form is *not* a real word) | — | 2026-07-25 | `data/pipeline/pseudowords.py` — the calibration list (`data/out/pseudowords.json`) used to correct for guessing, per `docs/engine-contract.md` |

## Content licence

The passage library (`content/passages/`), the slot classes
(`content/classes/`), and any rewritten glosses that ship are released
**CC0** — the project owns the infrastructure that serves this content, not
the content itself (ADR-008 amendment). Attribution is welcomed and never
required.
