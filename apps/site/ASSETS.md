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
were removed in PR #108. The encoded scene data above is the only derived visual
asset that remains in the published tree.

## Network-loaded dependencies

The generated runtime loads these version-pinned files with Subresource
Integrity hashes:

- [React 18.3.1 and React DOM 18.3.1](https://github.com/facebook/react/blob/main/LICENSE) — MIT
- [Babel Standalone 7.29.0](https://github.com/babel/babel/blob/main/LICENSE) — MIT

The page loads the Geist, Geist Mono, and Geist Pixel typefaces through Google
Fonts. The family is distributed under the
[SIL Open Font License 1.1](https://github.com/vercel/geist-font/blob/main/OFL.txt).

The assembled browser check permits only `unpkg.com`, `fonts.googleapis.com`,
and `fonts.gstatic.com` as external landing-page hosts. It rejects new hosts and
the retired design-system JavaScript bundle.

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
`script-src`/`connect-src`/`style-src`/`font-src` to `'self'` plus exactly the
hosts named above. The browser enforces this at the moment a request is made,
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
