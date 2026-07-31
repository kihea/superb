# Data manifest (fixture)

**Individual sourced excerpts** (`content/sources/*.json`) are not rows in
this table — each one carries its own complete `provenance` record instead.

| Dataset | Source | Licence | URL | Retrieved | Used for |
|---|---|---|---|---|---|
| wordfreq | Robyn Speer | Apache-2.0; SUBTLEX-US component, credit required | https://example.org | 2026-01-01 | `data/pipeline/difficulty.py` — content/difficulty.json, credit required |
| Panel-reviewed dictionary source | An external contributor pool | CC BY-SA 4.0 | https://example.org | 2026-01-01 | `data/pipeline/glosses.py` — gloss text, attribution to the source is required wherever a gloss surfaces |

## Content licence

The passage library and the slot classes are released **CC0**. Rewritten
glosses carry the source's credit and share-alike terms, not CC0.
