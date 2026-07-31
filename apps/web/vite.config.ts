import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: { enabled: true },
      manifest: {
        name: "Superb",
        short_name: "Superb",
        description: "A quiet place to read.",
        start_url: "/",
        display: "standalone",
        // The paper the app actually opens on now (design/ox.css's
        // --ox-paper), not the dark room it used to.
        background_color: "#F6EFE4",
        theme_color: "#F6EFE4",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
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
        // The app has real routes now. Every one of them is served by the
        // same document, offline included.
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
