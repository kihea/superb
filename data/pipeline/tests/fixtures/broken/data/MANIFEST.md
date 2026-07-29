# Data manifest (deliberately broken fixture)

Used by `data/pipeline/tests/test_check_license_gate.py` to prove
`data/pipeline/check_license_gate.py` actually fails on a real violation.
Four violations on purpose: `fake_dataset.py` (see the sibling
`pipeline/` directory) is never mentioned in any row's "Used for" column;
the SWOW-EN row below is the exact dataset ADR-008 forbids by name,
under exactly the licence family that names it; and in the sibling
`content/sources/` directory, `src-broken.json` has no licence at all
while `src-broken-licence.json` states one that law 8 forbids outright.

| Dataset | Source | Licence | URL | Retrieved | Used for |
|---|---|---|---|---|---|
| wordfreq | Robyn Speer | Apache-2.0 | https://github.com/rspeer/wordfreq | 2026-07-25 | frequency.py |
| SWOW-EN | Small World of Words | CC BY-NC-ND | https://smallworldofwords.org/ | 2026-07-25 | this must never be here |
