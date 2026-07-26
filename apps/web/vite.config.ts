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
        background_color: "#0A0C10",
        theme_color: "#0A0C10",
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
