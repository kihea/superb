# apps/web

The reading surface. React 19 + TypeScript + Vite, installable as a PWA,
no server (ADR-004). See `workspace/tracks/T4-surface.md` in the private
root for what this track was asked to build and why.

## Running it

```sh
npm install
npm run dev
```

Open `/read?register=glass` and `/read?register=paper` side by side --
these are the two answers to the one open question this PR asks
(`docs/decisions` ADR-019: does the page behind the words stay dark and
atmospheric, or go quiet like paper while someone reads). `/` is a small
comparison picker, not a product screen.

## The mock engine

`superb-wasm` (T2) has not landed yet. `src/engine/mockEngine.ts` stands in
for it -- fixture logic against real content, never the real scheduler --
behind the `VITE_MOCK_ENGINE` flag (on by default; set it to `"false"` to
see the screen's actual inert-without-an-engine state). It is deleted
whole the day the real binding exists; nothing in it should survive that
day (`docs/seams.md` §Seam 1).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `npm run build` | Vite, with content and tokens synced first (see below) |
| `npm run typecheck` | `tsc -b`, no emit |
| `npm run lint` | `oxlint` |
| `npm run test:e2e` | Playwright, against a real production build (`playwright.config.ts` builds + serves `dist/`) |
| `npm run sync-content` | Copies `../../content/passages` and `../../content/sources` (T3's, read-only) into `public/content/` as two arrays. Regenerated before every dev/build; never commit its output. |
| `npm run sync-tokens` | Generates `src/design/tokens.css` from `../../design/tokens.json`. Same deal -- generated, gitignored, regenerated automatically. |
| `node scripts/screenshot-registers.mjs <dir>` | Dev utility: screenshots both registers, light and dark, against a running preview on `:4319` |
| `node scripts/check-installability.mjs` | Chrome's own `Page.getInstallabilityErrors`, against a running preview on `:4319` -- Lighthouse 11+ dropped the standalone `pwa` category |
| `node scripts/check-offline.mjs` | Confirms a cold load works with the network off, against a running preview on `:4319` |

## What this app does not do yet

No probe screen, no deck, no Shelf, no onboarding, no orb -- the seam
(`EnginePort`) declares their events so the types compile, but nothing in
this build fires them. The reading screen, built twice, was the whole ask.
