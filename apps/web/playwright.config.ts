import { defineConfig } from "@playwright/test";

// 4319 is the shared default, and more than one agent's ad hoc loop has
// collided on it this week -- not just the same process restarting on its
// own port, but two independent runs racing for the same one. Set
// PLAYWRIGHT_PORT to something private for your own edit-rebuild-retest
// loop instead of hand-editing this file.
const PORT = Number(process.env.PLAYWRIGHT_PORT) || 4319;
const serverCommand = process.env.PLAYWRIGHT_USE_EXISTING_BUILD === "1"
  ? `npm run preview -- --port ${PORT} --strictPort`
  : `npm run build && npm run preview -- --port ${PORT} --strictPort`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Headless Chromium under heavy parallel load (many workers on a shared
  // or CPU-constrained machine) can starve an IntersectionObserver
  // callback for seconds at a time -- an infrastructure timing variance,
  // not a logic bug, and standard practice is retries + fewer workers in
  // CI rather than chasing it in application code. Unlimited locally,
  // where a developer wants an honest first-run signal.
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  // Running this by hand in a rapid edit-rebuild-retest loop: kill any
  // process still holding your port and don't reuse it, and clear the
  // browser's own storage/service-worker cache between runs too -- two
  // reviewers this week lost time to a stale preview server (or the PWA's
  // own precache) quietly serving an old build against a fresh test run,
  // reading a broken build as green and a fixed one as red.
  webServer: {
    command: serverCommand,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
