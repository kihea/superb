# apps/web

The reading surface. React 19 + TypeScript + Vite, installable as a PWA, no
server (ADR-004). Runs the real `superb-core` engine compiled to WebAssembly
(`crates/superb-wasm`) -- there is no mock engine in this build.

## Running it

```sh
npm install
npm run dev
```

Opens on `/`: a real composed passage, drawn by the real engine from
`content/passages/` and `content/sources/`. Tap any word for a gloss (from
`src/fixtures/glosses.ts` -- hand-written coverage for this pool, not yet the
real Wiktionary pipeline; see "What's real and what's still mock" below).

## What actually deploys (truthful-alpha checkpoint, PLAN.md §7)

Production navigation -- what a stranger can reach by clicking, from the
real deployed URL -- is deliberately smaller than the route map
(`src/routes.ts`) lists. Every route in `ROUTES` still exists and still
renders (App.tsx routes all of them, and `e2e/walkable-v0.spec.ts` still
sweeps all of them for phone width, dark mode, and console errors); the
difference is which ones anything links to. `src/routes.ts`'s own
`productionNav: false` marks the rest, and
`e2e/walkable-v0.spec.ts`'s "production navigation never reaches a route
marked productionNav: false" test is the acceptance check that a link into
one of them never sneaks back in.

**Real, and reachable:**

- **Reading** (`/`) -- a real passage from the real engine, real word taps,
  real glosses (composed-passage pool; see the fixtures note below), the
  Keep gesture on a held sentence (ADR-036).
- **Library** (`/library`) -- real search over the real catalogue artifact
  (`content/catalogue.lock.json`; Slice 1A, PLAN.md §7). Carries one book
  today, *Dracula*.
- **A book's own page and its chapters** (`/book/:id`, `/book/:id/read`) --
  real text, real provenance, every word tappable, real glosses from that
  book's own gloss table (`content/glosses/`), a place that survives reload,
  and a shell-owned encounter log that never touches the engine
  (ADR-031 -- book encounters are recorded and consume nothing).
- **Settings** (`/settings`) -- paper, text size, and motion all take real
  effect and survive a reload; the voice row previews the phone's own real
  `speechSynthesis`; the About section carries the Wiktionary attribution
  ADR-008 requires.

**Still `v0mock`-backed, and hidden from production navigation on purpose**
(`productionNav: false` in `src/routes.ts`; App.tsx still routes each of
these, reachable by typing the address, same as any other in-progress work):

| Route | Why it's hidden |
|---|---|
| `/shelf` | Current/waiting/read books are all `v0mock` fixture data, not the real catalogue or a real reading-history store (Slice 1C's job) |
| `/rhyme`, `/association`, `/elevated` | Hand-written rounds/fields/tiers, not the engine's real band words or a licensed rhyme/association artifact (Phase 3) |
| `/voice` | A paid-voice upsell screen quoting `v0mock` text; nothing plays audio (Phase 2 makes voice honest first) |
| `/sign-in` | "The buttons are real controls with nothing behind them yet; there is no account system in this build" (the screen's own comment) |
| `/share` | Used to be reachable by holding a sentence and choosing "Send to someone"; removed that control because the screen always showed one invented sentence regardless of what was actually held |
| `/welcome` | Its three mood buttons are currently identical -- "three identical mood buttons must not ship as a claim" (PLAN.md §7) |

## What's real and what's still mock, on the reading screen itself

The composed-passage reading loop at `/` (`useEngineSession.ts`,
`docs/seams.md`'s `plan -> content.fetch -> decide -> storage.put -> render`)
is real end to end: the real engine, real `content/passages/` and
`content/sources/`, real IndexedDB persistence. The one piece still `v0mock`
inside that loop is the gloss text itself -- `src/fixtures/glosses.ts`,
hand-written coverage for this pool's own vocabulary, says so in its own
header comment. The *book* reading path (`/book/:id/read`) does **not**
share this gap: its glosses come from the real pipeline
(`data/pipeline/glosses.py`, run against a live Wiktionary snapshot), narrowed
to that book's own words. Replacing the passage pool's fixture glosses with
the same real pipeline is tracked separately from this file.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `npm run build` | Vite, with content and the wasm engine built first (see below) |
| `npm run typecheck` | `tsc -b`, no emit |
| `npm run lint` | `oxlint` |
| `npm run test:unit` | Vitest -- fast, no browser |
| `npm run test:e2e` | Playwright, against a real production build (`playwright.config.ts` builds + serves `dist/`) |
| `npm run test` | typecheck, lint, unit, build, then e2e, in that order |
| `npm run sync-content` | Copies `../../content/passages`, `../../content/sources`, `../../content/classes`, `../../content/difficulty.json`, the catalogue artifact, and any book gloss tables into `public/content/`. Regenerated before every dev/build; never commit its output. |
| `npm run sync-tokens` | Generates `src/design/tokens.css` from `../../design/tokens.json`. Same deal -- generated, gitignored, regenerated automatically. |
| `npm run build-wasm` | Builds `crates/superb-wasm` and binds it with `wasm-bindgen` into `src/engine/wasm-pkg` (and a Node target for tests) |
| `node scripts/check-installability.mjs` | Chrome's own `Page.getInstallabilityErrors`, against a running preview on `:4319` -- Lighthouse 11+ dropped the standalone `pwa` category |
| `node scripts/check-offline.mjs` | Confirms a cold load works with the network off, against a running preview on `:4319` |
