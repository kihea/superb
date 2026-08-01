import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// T10 job 1: the app is served from a subpath (superb.works/read/) inside
// the assembled deploy, but stands alone at "/" for its own CI (web.yml) and
// local dev. One constant, changed in one place -- .github/workflows/site.yml
// sets VITE_BASE when it builds this app into the assembled artifact; every
// other caller (dev, web.yml's own build/test, `vite preview`) gets the "/"
// default. src/content/store.ts reads the same value back at runtime via
// import.meta.env.BASE_URL, which vite derives from this.
const BASE = process.env.VITE_BASE ?? "/";

// https://vite.dev/config/
export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: { enabled: true },
      manifest: {
        name: "Superb",
        short_name: "Superb",
        description: "A quiet place to read.",
        start_url: BASE,
        scope: BASE,
        display: "standalone",
        // The paper the app actually opens on now (design/ox.css's
        // --ox-paper), not the dark room it used to. Every icon keeps the
        // BASE prefix so it resolves when the app is assembled at /read/.
        background_color: "#F6EFE4",
        theme_color: "#F6EFE4",
        // ADR-040 / issue #123: an SVG-only manifest makes Android install
        // a "should" rather than a "does" -- Chrome on Android has never
        // reliably accepted an SVG as an install icon, so without a raster
        // entry the install prompt is either absent or falls back to a
        // generic glyph, and the maskable variant Android's own adaptive-
        // icon system expects is missing entirely.
        //
        // Every file here is the real brand mark (brand/out/identity/icons/,
        // private root), not generated art -- `icon-192.png`/`icon-512.png`
        // as shipped there, unmodified, for `any`. Those same two files are
        // *not* safe for `maskable` as they ship: checking the PNG's own
        // alpha channel found transparent corners (a rounded-rect cutout,
        // not an edge-to-edge fill), which is exactly what a maskable icon
        // must not have -- an OS mask of a different shape would show
        // through the gaps. `icon-maskable-192.png`/`-512.png` are derived
        // from the brand set's own `icon-1024.png`: the glyph's own
        // farthest points already sit inside the maskable safe zone (a
        // circle of 40% radius centred on the icon), so the only fix
        // needed was filling those transparent corners with the icon's own
        // average background tone, sampled from its own opaque pixels
        // rather than guessed, so the result stays edge-to-edge opaque
        // (verified: the derived file has no alpha channel at all) without
        // redrawing anything.
        icons: [
          { src: `${BASE}icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
          { src: `${BASE}icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
          { src: `${BASE}icon-maskable-192.png`, sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: `${BASE}icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // The app shell and self-hosted fonts are small and stable --
        // precached, so a first visit is fully offline-capable right away.
        // content/*.json is deliberately NOT precached: T3b's corpus keeps
        // growing (workspace/contract.md targets thousands of indexed
        // excerpts), and it already crossed workbox's 2 MiB precache
        // ceiling once (60 sourced excerpts to 2,600 turned
        // content/sources.json from a few KB into 2.79 MB). A precache
        // that has to be raised every time the corpus grows does not
        // scale with it; runtime caching does.
        // `wasm` was missing from this list, and the engine is a .wasm file:
        // offline, the shell painted and then said "Something went wrong
        // loading this session", because the one request that failed was
        // /assets/superb_wasm_bg-*.wasm. Found by repairing
        // scripts/check-offline.mjs, whose URLs still pointed at a route
        // that stopped existing when the register question was settled --
        // so nobody had run it in a while. The engine belongs in the
        // precache for the same reason the fonts do: it is part of the
        // shell and it is stable, unlike content/*.json, which keeps
        // growing and stays on runtime caching below.
        globPatterns: ["**/*.{js,css,html,woff2,wasm,svg,ico,png}"],
        // Pinned, not fixed: vite-plugin-pwa already defaults to this, and
        // the generated sw.js is byte-identical with the line removed. It
        // is written down because the app has real routes now and this is
        // what serves all of them from one document offline -- but nobody
        // should count it as the change that made deep routes work. On a
        // cold first visit, before any service worker exists, the thing
        // that does that is public/_redirects.
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: /\/content\/.*\.json$/,
            handler: "CacheFirst",
            options: {
              cacheName: "content",
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
});
