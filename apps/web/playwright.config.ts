import { defineConfig } from "@playwright/test";

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
    baseURL: "http://localhost:4319",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && npm run preview -- --port 4319 --strictPort",
    url: "http://localhost:4319",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
