# Superb web app

A reading app built with React 19, TypeScript, and Vite, installable as a
PWA. There is no application server: everything is static files plus the
reader's own browser storage.

## The rooms

- **Shelf** (`/`) holds the books you are reading, with the current one
  largest. The very first visit redirects to `/welcome`, a short three-tap
  opening that ends with a book chosen.
- **Library** (`/library`) lists 1,478 public-domain books, searchable by
  title or author and browsable by kind.
- **Book** (`/book/:id` and `/book/:id/read`) is a cover page, then the book
  itself. While reading, words that have a saved meaning are tappable; a
  tap opens a small card with the meaning and a Keep button. Your place in
  each book is saved as you scroll and survives reloads. Ordinary reading
  is private: it records nothing beyond your place and what you choose to
  keep.
- **Play** (`/play`) holds three games. **Rhyme** and **Association** show a
  word and judge what you offer back, with seven difficulty tiers.
  **Prose** (`/play/prose`) shows a passage composed for you by the
  learning engine. That engine (`superb-core`, compiled to WebAssembly) is
  used only here, nowhere else in the app.
- **Words** (`/words`) lists every word and sentence you have kept, each with
  its meaning and the sentence it was met in.
- **Settings** (`/settings`) covers page layout, motion, the reading voice,
  and Goodreads import and export.

The full route list lives in `src/routes.ts`.

## The data it fetches

- `/content/catalogue-index.json` holds one small row per book, for the
  Library and cover pages.
- Book text and that book's word meanings are fetched together from the
  public library repository through jsDelivr's CDN when a book is opened,
  from `books/<id>/book.json` and `books/<id>/glosses.json`, then held in
  the Cache API so a book once opened reads offline and still answers taps.
  One book (Dracula) is served locally, from the vendored
  `catalogue-v0.1.0.json` and `/content/glosses/bram-stoker_dracula.json`,
  which is what the tests read and what the offline check walks.
- `/content/glosses/senses.json` and `/content/glosses/prose.json` are the
  shared sense lists and the composed-passage table, which belong to the
  app rather than to any one book.
- `/content/challenges/*.json` holds rhyme prompts, pronunciations,
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
