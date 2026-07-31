// Waits for the preview server to answer, so the two PWA checks after it in
// CI do not race it. Twenty lines instead of a dependency: this branch adds
// no packages, and a poll loop is the whole of what `wait-on` would do here.

const ORIGIN = process.env.SUPERB_PREVIEW_ORIGIN ?? "http://localhost:4319";
const DEADLINE = Date.now() + 60_000;

while (Date.now() < DEADLINE) {
  try {
    const response = await fetch(ORIGIN, { method: "GET" });
    if (response.ok) {
      console.log(`preview is up at ${ORIGIN}`);
      process.exit(0);
    }
  } catch {
    // Not listening yet.
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}

console.error(`preview never came up at ${ORIGIN} within 60s`);
process.exit(1);
