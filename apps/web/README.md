# Superb web app

A reading app built with React 19, TypeScript, and Vite, installable as a
PWA. There is no application server: everything is static files plus the
reader's own browser storage.

## The rooms

- **Shelf** (`/`) — the books you are reading, the one you are in largest.
  The very first visit redirects to `/welcome`, a short three-tap opening
  that ends with a book in your hands.
- **Library** (`/library`) — 614 public-domain books, searchable by title
  or author and browsable by kind.
- **Book** (`/book/:id` and `/book/:id/read`) — a cover page, then the book
  itself. While reading, words that have a saved meaning are tappable; a
  tap opens a small card with the meaning and a Keep button. Your place in
  each book is saved as you scroll and survives reloads. Ordinary reading
  is private: it records nothing beyond your place and what you choose to
  keep.
- **Play** (`/play`) — three games. **Rhyme** and **Association** show a
  word and judge what you offer back, with seven difficulty tiers.
  **Prose** (`/play/prose`) shows a passage composed for you by the
  learning engine — the engine (`superb-core`, compiled to WebAssembly) is
  used only here, nowhere else in the app.
- **Words** (`/words`) — every word and sentence you have kept, each with
  its meaning and the sentence it was met in.
- **Settings** (`/settings`) — theme, motion, and the like.

The full route list lives in `src/routes.ts`.

## The data it fetches

- `/content/catalogue-index.json` — one small row per book, for the
  Library and cover pages.
- Book text — fetched per book from the public library repository through
  jsDelivr's CDN when a book is opened, then held in the Cache API so a
  book once opened reads offline. One book (Dracula) is served locally
  from the vendored `catalogue-v0.1.0.json`, which is what the tests read.
- `/content/glosses/<book-id>.json` — each book's word meanings.
- `/content/challenges/*.json` — rhyme prompts, pronunciations,
  association prompts, and their answer indexes.

Reader state (shelf, places, kept words and sentences, and the prose
game's engine state) lives in IndexedDB under `superb-web`.

## Run it

From the repository root, once per machine:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.126 --locked
```

Then:

```sh
cd apps/web
npm ci
npm run dev
```

The dev server's pre-run hook builds the WebAssembly engine, syncs content,
and generates CSS from the design tokens.

## Tests

```sh
npm run test:unit   # Vitest
npm run test:e2e    # Playwright, against a production build
npm test            # typecheck + lint + unit + e2e
```

Playwright needs Chromium once per machine: `npx playwright install chromium`.

Generated content, token CSS, WebAssembly bindings, build output, and test
output are ignored by Git; a normal build or test run leaves tracked files
unchanged.
