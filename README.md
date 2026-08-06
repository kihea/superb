# Superb

A reading app that makes you better with words.

You open it and read. The library holds 1,512 works, all free to share: 1,478
books built on Standard Ebooks editions, 26 of Project Gutenberg's most-read
titles retypeset by hand, and eight United States patents, from Bell's
telephone to a method of exercising a cat. Tap a word you do not know and its
meaning opens on the page, and you can keep the ones worth keeping. When you
want to practise, there are three games: rhyme, association, and prose composed
for you by an engine that learns which words you are ready for. The device can
read the books aloud. There is no review queue, streak, level or score.

## What's here

- **The reader.** The library, book pages, saved places, tap-a-word meanings,
  kept words and sentences, and read-aloud. Book text lives in the
  [library repository](https://github.com/superb-catalogue/library), is served
  from superb.works/catalogue/ on our own zone, and is cached on device;
  everything the reader does stays on the device.
- **The games.** Rhyme and association take anything you type or say and judge
  it against real data: pronunciations from CMUdict, and word connections from
  WordNet and our own corpus. Each then shows you what you could have said.
  Prose is a passage composed for you; tapping the words you don't know is the
  whole exercise, and it is the only place the learning engine takes a reading
  from.
- **The engine** (`crates/superb-core`): word state, scheduling, ability
  estimation, signal ranking, and passage composition. It is pure, with no
  clock, no random number generator and no I/O; callers supply time and seeds.
  `crates/superb-wasm` exposes it to the web app; `crates/superb-sim` runs
  synthetic readers through long checks.
- **The shells.** `apps/web` is a React + Vite PWA, served at `/read/` on
  [superb.works](https://superb.works) and installable offline. `apps/android`
  is that app as an installable Android package (a Trusted Web Activity).
  `apps/site` is the landing page.
- **The data.** `content/` holds the composed passages, cited excerpts, word
  meanings, and challenge data; `data/` holds the pipeline that builds it. CI
  checks every shipped dataset and cited excerpt against its licence and
  provenance record.

A shell may render, gesture, persist and keep time. It may not decide. Every
decision lives in the core, so the shells behave the same way without anyone
having to keep them in step by hand.

The app runs on-device and keeps reader state local. It has no account, sync,
or payment service.

## Run it locally

You need Rust 1.96, Node 24, Python 3.12, and `tar`. The checked-in Rust
toolchain file installs the right compiler; the web build also needs the
`wasm32-unknown-unknown` target and `wasm-bindgen-cli` 0.2.126.

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.126 --locked
cd apps/web
npm ci
npm run dev
```

For the engine alone:

```sh
cargo test -p superb-core --all-features --locked
```

The repository-level release check installs build dependencies, runs the fast
Python and Rust gates, builds and tests the web app, checks offline and PWA
behaviour, assembles the site, seals it, restores the exact archive, and
smoke-tests the restored bytes:

```sh
python scripts/release.py
```

Use `python scripts/release.py --list` to inspect the steps. `--skip-install`
is for an already-provisioned checkout: Python requirements and NLTK data,
`wasm-bindgen-cli` 0.2.126, `cargo-deny` 0.20.2, npm dependencies, and Chromium
must already be present. The scheduled deep simulator and report checks are
intentionally separate from this command.

## Licensing

<!-- LICENCE-CLAIMS:START -->
**Code is source-available: MIT + Commons Clause. Content is CC0 where we wrote
it, and carries its own terms where we didn't.**

You may read the code, run it, change it, and pass it on, changed versions
included, as long as it is free. You may not sell it, or sell a product or
service whose value comes substantially from it. That one restriction is what
makes this source-available rather than open source, which is why the project
does not describe itself as open source.

Content is not all under one licence. What decides is not who typed it but
whose work it came from. There are three kinds:

**Written here from nothing** are the passages, the slot library, and the
schemas. These are CC0 and unrestricted. Attribution is welcome and never
required; the project claims the infrastructure that serves the content, not
the content itself.

**Built here from somebody else's work.** These carry that work's terms, not
ours, even though our scripts produced them: running a dataset through a script
of ours does not make the result ours. There are two live cases. The first is
`content/difficulty.json`, whose numbers come from Robyn Speer's `wordfreq` and
which travels with the credit that list requires. The second is the gloss
tables, which start from Wiktionary and so carry its credit and its
pass-on-the-same-freedom terms: the games' table
`content/challenges/glosses.json`, the composed-prose table
`content/glosses/prose.json`, and the shared sense table
`content/glosses/senses.json`. Each book's own gloss table carries the same
terms, and lives beside that book in the
[library](https://github.com/superb-catalogue/library) rather than here, so
the app fetches a book's text and its word meanings from one place. The rhyme
and association data carry CMUdict's and WordNet's notices the same way.

**Not authored here at all** is the text inside cited excerpts, and the books
in the [library](https://github.com/superb-catalogue/library). Each keeps
whatever terms it arrived under: public domain and CC0 where possible, and
licences asking for credit or for the same freedom to be passed on where that
is what the good source carries.

Nothing non-commercial and nothing all-rights-reserved enters a build, ever.

Each obligation is written down next to the thing it binds, so it stays with
that file and never spreads into ours or into the code: **datasets** have a row
in `data/MANIFEST.md`, with the credits that must travel in `data/NOTICE.md`;
**each excerpt** carries its own provenance record beside it in
`content/sources/`; **each book** carries its own beside it in the library.

No GPL enters the dependency tree. Every dataset has a row in
`data/MANIFEST.md` with its source, licence, and redistribution basis, and CI
fails without one. SWOW-EN and the USF association norms are permanently
excluded: they are not licence-compatible with a product that has a paid tier,
and no amount of convenience changes that.
<!-- LICENCE-CLAIMS:END -->

## Thanks to Standard Ebooks

The library of whole books Superb reads from is built on
[Standard Ebooks](https://standardebooks.org) editions.

They take public-domain books, proofread them properly, and typeset them with
real care. They then put the whole file in the public domain, their own editing
work included. That last part is unusual. Most people who improve a free text
keep something back for the improving; Standard Ebooks gives it away, which is
why their editions are the ones worth building on and why anyone else can build
on them too.

The books live in a separate repository,
[superb-catalogue/library](https://github.com/superb-catalogue/library), so that
nobody working on the engine has to download a library and nobody adding a book
has to download an engine. Each book there records the edition it came from and
the terms it arrived under.

If you use their editions, consider [supporting
them](https://standardebooks.org/donate).

## Built with AI tooling

Superb is developed with substantial help from AI coding agents, working under
a written decision record and reviewed against a fixed test suite before
anything merges. Individual commits are not annotated with which model touched
them. The record of what changed is the diff and the tests, the same as any
other project.

## Contributing

Open. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, tests, and conventions;
participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). Bug
reports and feature requests use the issue forms. The well-bounded lanes are
passage and slot authoring, sourcing and citing public-domain excerpts, gloss
rewrites, example-sentence curation, and phonetics edge cases.

A contributed excerpt needs a complete, checkable citation, and has to use its
target vocabulary in a context informative enough that a reader can work the
meaning out from the writing itself. That is the whole bar, and it is a higher
bar than it sounds.

Contributions are DCO sign-off (`git commit -s`), not a CLA.
