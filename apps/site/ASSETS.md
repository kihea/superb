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
