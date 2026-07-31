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
        background_color: "#0A0C10",
        theme_color: "#0A0C10",
        icons: [{ src: `${BASE}icon.svg`, sizes: "any", type: "image/svg+xml", purpose: "any" }],
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
        globPatterns: ["**/*.{js,css,html,woff2,svg,ico,png}"],
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
