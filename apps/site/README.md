# apps/site

The public landing page: Kihea's own designed page, served verbatim from
`page/` (his drop, unedited — the same files as
`workspace/prototypes/landing-mockup` on the private root). The previous
rebuilt-from-figures page and its generator were retired on his direction
(2026-07-31: "ensure it's literally just copied over"); they live in git
history at this branch's base.

```sh
npm run build   # copies page/ into dist/, names the page index.html
```

Static files, no framework, no dependencies. Deploys to
`https://superb.works` (Cloudflare, Kihea's own setup — the publish
workflow arrives with PR #94/#95's reconciliation).
