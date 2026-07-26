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
        // Content (content/passages.json, content/sources.json) and the
        // self-hosted fonts have to be in the precache, not just runtime
        // cached, for a true cold offline load to work (T4's DONE list:
        // "offline load works with the network off").
        globPatterns: ["**/*.{js,css,html,woff2,json,svg,ico,png}"],
      },
    }),
  ],
});
