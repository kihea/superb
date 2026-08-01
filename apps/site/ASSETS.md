# Landing asset provenance

The landing page began as a design export supplied and committed by repository
owner Kihea Adams-Wilson in PR #97 on 2026-07-30. The shipping tree keeps only
the files it uses.

## Project-owned generated files

- `page/scene.js` is encoded colour and luminance data for the ASCII hero. It was
generated from the image supplied with that design export and is distributed as
part of Superb under the repository's code licence.
- `page/support.js` is the generated `dc-runtime` used to render the exported
page and run the ASCII scene. It was supplied in the same owner-authored export
and is distributed under the repository's code licence.

The original export included two byte-identical 2,527,364-byte PNGs,
`ChatGPT Image Jul 30, 2026, 12_57_20 AM.png` and `hero-scene.png`, both with Git
blob ID `0f4acba218c6f3f1302602999e930d28acd02858`. They were unused at runtime and
were removed in PR #109. The encoded scene data above is the only derived visual
asset that remains in the published tree.

- `page/brand/favicon-16.png`, `favicon-32.png`, and `apple-touch-180.png` are
copied unmodified from the finalized brand identity kit's own `icons/` output
(private root, `brand/out/identity/icons/`), owner-rendered, distributed under
the repository's code licence.
- `page/brand/lockup-night.png` is the identity kit's `lockup-night.png`
(same source), processed once by `scripts/make-transparent.mjs` to add a real
alpha channel -- the kit's own render is flat RGB, and the header sits over
the animated ASCII scene rather than a solid ground. No pixel is otherwise
changed; this replaces the header's earlier "/// superb" CSS approximation
of the mark (issue #113) with the real rendered lockup.

## Vendored and self-hosted dependencies (issue #137)

The generated runtime used to load React, React DOM, and Babel Standalone
from `unpkg.com` at read time (pinned by Subresource Integrity), and the
Geist family from Google Fonts (`fonts.googleapis.com`/`fonts.gstatic.com`).
Both told those hosts every visitor's IP on every page view, which the
landing's own copy plainly contradicted by claiming to be Private. Both are
vendored into the artifact instead, and the landing now makes no request to
any third-party host at all.

- `page/vendor/react.production.min.js`, `react-dom.production.min.js`, and
  `babel.min.js` are the same pinned versions (18.3.1, 18.3.1, 7.29.0) and the
  same bytes unpkg served — verified by sha384 against the SRI hashes
  `page/support.js` already carried, before vendoring rather than assumed, so
  `support.js`'s own integrity check still passes against the local copies
  unchanged. Licences (both MIT) are recorded in `page/vendor/NOTICE.txt`:
  [React 18.3.1 and React DOM 18.3.1](https://github.com/facebook/react/blob/main/LICENSE),
  [Babel Standalone 7.29.0](https://github.com/babel/babel/blob/main/LICENSE).
- `page/fonts/geist-variable-latin.woff2`, `geist-mono-variable-latin.woff2`,
  and `geist-pixel-latin.woff2` are Geist, Geist Mono, and Geist Pixel,
  subset to the weights the page actually uses, one variable file per family.
  Verified per family against Google Fonts' own metadata (`"license": "ofl"`)
  before vendoring rather than assumed. `page/fonts/fonts.css` declares them;
  `page/fonts/LICENSE-OFL.txt` is the real
  [SIL Open Font License 1.1](https://github.com/vercel/geist-font/blob/main/OFL.txt)
  text, from `vercel/geist-font` and `vercel/geist-pixel-font`.

The assembled browser check's runtime allow-list for the landing
(`ALLOWED_LANDING_HOSTS` in `scripts/check-assembled.mjs`) is now empty — a
script that fetched from any external host at all would still fail it. Its
static text-scan allow-list (`ALLOWED_LANDING_NAMED_HOSTS`) permits a small,
named set of hosts that appear only as text *inside* the vendored files
themselves (a documentation link inside a thrown error message, a DOM
namespace URI constant, the OFL licence's own FAQ link) — never fetched,
each with its own one-line reason in that file. A separate, separately named
allow-list (`ALLOWED_READ_NAMED_HOSTS`) covers the reading app's own
assembled output under `dist/read/` (issue #128) — the app's real source
citations for each book and a handful of the same kind of developer-facing
text, not new egress. The check also rejects the retired design-system
JavaScript bundle, and (issue #127) decodes UTF-16 text correctly before
scanning it, rather than reading every file as latin1.

## The boundary is the Content-Security-Policy, not the check (issue #126)

The check above reads files and text before anything ships; it is a fast early
warning, not a guarantee. An independent review demonstrated why: the check
skips binary files (images, fonts) because they normally cannot carry a web
address, and a JavaScript file it *does* read can fetch such a file at runtime
and execute whatever bytes come back — the check passes clean while the page
genuinely reaches an outside server. Three earlier rounds of making the check
read more (a filename, then exact file contents, then more file types) were
each defeated the same way, by disguising the payload as something the check
still does not open.

`dist/_headers` (written by `scripts/assemble.mjs`, not committed as a static
file) sets a `Content-Security-Policy` on both surfaces, restricting
`script-src`/`connect-src`/`style-src`/`font-src` to `'self'` alone — since
issue #137 vendored the last of the landing's third-party loads, neither
surface's policy names an external host at all. The browser enforces this at
the moment a request is made,
regardless of what the requesting file was named, what MIME type it claimed,
or how the address it used was assembled — the property the file-content check
cannot have. `scripts/check-csp.mjs` proves it live: it reintroduces the
retired bundle's own bypass shape (a same-origin script fetching a payload
from an outside origin and running it) against the real assembled artifact,
with its real headers applied, and asserts the browser blocks the fetch,
reports a `securitypolicyviolation`, and the payload never runs — not that a
scanner would have caught it, that the browser actually stopped it.

The landing page's own `script-src` includes `'unsafe-eval'`, audited rather
than assumed necessary: `page/support.js` runs Babel-transformed JSX via
`new Function(...)` at runtime, which CSP treats the same as `eval()`. This
does not reopen the hole the policy exists to close — `'unsafe-eval'` governs
*how* already-loaded, already-origin-restricted code may execute, never
*which host* it may reach; `connect-src`'s host allow-list is what actually
blocks the attack this issue describes, and that holds whether or not eval is
permitted. The reading app (`/read/*`) needs no such allowance — its
`script-src` carries `'wasm-unsafe-eval'` only, CSP's own narrower permission
for `WebAssembly.instantiate`, and reaches no host beyond itself at all.
