import { defineConfig } from "vitest/config";

// Separate from vite.config.ts on purpose -- these tests run under Node
// (tests/engine-persistence.test.ts drives the real wasm-bindgen "nodejs"
// target and fake-indexeddb; nothing here needs a browser DOM), while
// vite.config.ts stays the app's own dev/build config. `npm run test:unit`.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
