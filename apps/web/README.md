# Superb web app

The current product shell is a React 19, TypeScript, and Vite PWA with no
application server. It runs by itself at `/` during local development and web
CI. The site assembler builds the same app with a `/read/` base path and places
it beside the landing page.

## What is real

- The reading screen uses `superb-core` through the generated `superb-wasm`
  binding. There is no mock engine or engine feature flag.
- Passage and source content is generated from the repository's `content/`
  files before each development build.
- Learner state, including topic affinity, is persisted in IndexedDB and stays
  off screen.
- The production build is installable and caches the app shell, WebAssembly,
  and visited content for offline use.

## What is still a prototype

The broader product shell has fourteen screens, but several are backed by the
invented data in `src/v0mock/index.ts`: Library, Shelf, whole-book reading,
rhyme, association, elevated passages, sharing, and the voice presentation.
The voice route does not synthesize audio. Gloss definitions still come from
`src/fixtures/glosses`.

That boundary is deliberate and temporary. New product work must replace one
mock-backed path with real data rather than adding another source of invented
state.

## Run it

From the repository root, install `wasm-bindgen-cli` at the version used by the
workspace and add Rust's WebAssembly target:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.126 --locked
cd apps/web
npm ci
npm run dev
```

The development server prints the local URL. Its pre-run hook builds the Rust
crate, creates browser and Node bindings, syncs content, and generates CSS from
the design tokens.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Syncs generated inputs, builds WebAssembly, then starts Vite |
| `npm run build` | Syncs generated inputs, builds WebAssembly, then creates `dist/` |
| `npm run typecheck` | `tsc -b`, no emit |
| `npm run lint` | `oxlint` |
| `npm run test:unit` | Runs the Vitest suite |
| `npm run test:e2e` | Runs Playwright against a production build |
| `npm test` | Runs type checking, lint, unit tests, a build, and Playwright |
| `npm run ci:prepare` | Generates content, tokens, and Wasm once for CI |
| `npm run sync-content` | Regenerates `public/content/` from `../../content/` |
| `npm run sync-tokens` | Regenerates `src/design/tokens.css` from `../../design/tokens.json` |

Playwright needs Chromium once per machine:

```sh
npx playwright install chromium
```

Generated content, token CSS, WebAssembly bindings, build output, Playwright
output, and package installs are ignored by Git. A normal build or test run
must leave tracked files unchanged.
