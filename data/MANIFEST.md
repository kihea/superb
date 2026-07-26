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
| Wiktionary, via `wiktextract` | English Wiktionary contributors, extracted by Tatu Ylonen's `wiktextract` (MIT code), published by kaikki.org | CC BY-SA 4.0 or GFDL (reader's choice) — share-alike obligation deliberately accepted per ADR-008's amendment | https://kaikki.org/dictionary/English/ | 2026-07-25 | `data/pipeline/glosses.py` — raw dictionary glosses (`data/out/glosses.json`), rewritten and panel-reviewed downstream (ADR-012) before anything reaches a reader; attribution to Wiktionary is required wherever a gloss surfaces (Settings → About). Also consulted, read-only, by `data/pipeline/excerpts.py`'s "gloss-overlap" informativeness signal — the gloss text itself never ships from that path; it only helps decide whether an excerpt's own sentence already explains a word, so it carries no separate share-alike surface beyond the one this row already states |
| Pseudoword generator | Original — an English syllable/phonotactics model written for this project; no external dataset | N/A (no third-party content; only `wordfreq`'s word list is consulted, to confirm a generated form is *not* a real word) | — | 2026-07-25 | `data/pipeline/pseudowords.py` — the calibration list (`data/out/pseudowords.json`) used to correct for guessing, per `docs/engine-contract.md` |
| Sourced excerpts (literary corpus, at scale) | Project Gutenberg only, this run (Standard Ebooks and Wikisource are ADR-018 allow-listed but not wired up — see the PR body) | Public Domain (Project Gutenberg's own copyright-cleared determination, US) — verified per work in `data/pipeline/excerpts.py`'s `BOOK_CATALOG` and re-checked per excerpt in each file's own `provenance` (ADR-018) | https://www.gutenberg.org/ | 2026-07-25 | `data/pipeline/excerpts.py` — fetches, segments, and scores candidate excerpts from `BOOK_CATALOG`; this row exists so `check_license_gate.py`'s "every pipeline script has a manifest row" rule has one to find, not because individual excerpts are catalogued here — they are not (see the note above the table) |

## Content licence

The passage library (`content/passages/`), the slot classes
(`content/classes/`), and any rewritten glosses that ship are released
**CC0** — the project owns the infrastructure that serves this content, not
the content itself (ADR-008 amendment). Attribution is welcomed and never
required.
