# apps/site

The public landing page and the assembler that puts the reading app at
`/read/` beside it.

`page/Superb Landing.dc.html` retains Kihea's visual source. Shipping edits are
kept small and explicit: links must lead somewhere, public copy must describe
the build that exists, and the header must fit a phone. The previous generated
landing implementation remains in Git history.

```sh
npm ci
npm run build      # copy the landing into dist/
npm run assemble   # add the web app at dist/read/
npm run smoke      # check the sealed layout in Chromium
```

The smoke check opens the landing at a 390px viewport, rejects dead or clipped
links and unapproved runtime hosts, and verifies that `/read/` reaches a painted
passage. [ASSETS.md](ASSETS.md) records the generated scene/runtime provenance
and the licences of the permitted external dependencies. The site
workflow uploads the checked archive on every relevant build. It publishes to
Cloudflare only when the repository has the required account and API-token
secrets; a successful build does not by itself mean `superb.works` is live.
