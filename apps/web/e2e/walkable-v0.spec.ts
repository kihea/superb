// T15's own checks. v0 is breadth, so what these test is breadth: every
// screen in the route map renders at phone width, in light and in dark,
// without a console error and without a horizontal scrollbar. A failing
// route is the only kind of failure that matters here -- a misplaced pixel
// is not, and there is deliberately no per-screen battery of assertions.
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { ROUTES } from "../src/routes";

const PHONE = { width: 390, height: 844 };

/** Console errors and page errors, collected from before the first
 *  navigation so nothing that happens during load is missed. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  return errors;
}

/** Everything drawn wider than the viewport, named so a failure says which
 *  element ran off rather than only that something did.
 *
 *  Measuring `document.scrollWidth` is not enough and this was watched
 *  proving it: a screen with `overflow-x: hidden` on its own root clips the
 *  overflow instead of scrolling, so the document stays 390px wide while
 *  content sits off the edge where nobody can reach it -- which is the
 *  worse of the two failures, not the absence of one. Elements inside a
 *  deliberately sideways-scrolling strip (2d's tier row, the library's
 *  moods) are excluded, since running past the edge is what those are for. */
async function widerThanThePhone(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const scrolls = (el: Element) => {
      const overflow = getComputedStyle(el).overflowX;
      return overflow === "auto" || overflow === "scroll";
    };
    const out: string[] = [];
    for (const el of document.querySelectorAll("body *")) {
      let inStrip = false;
      for (let node = el.parentElement; node; node = node.parentElement) {
        if (scrolls(node)) {
          inStrip = true;
          break;
        }
      }
      if (inStrip) continue;
      // A decorative layer with nothing in it is allowed to be bigger than
      // the screen -- the reading state's aura is `inset: -20% -10%` on
      // purpose, aria-hidden, and clipped. Anything that carries a word
      // still has to fit. Narrow deliberately: an element with text in it
      // fails this check whether or not it is hidden from a screen reader.
      const decorative =
        el.closest('[aria-hidden="true"]') !== null && (el.textContent ?? "").trim() === "";
      if (decorative) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.right > window.innerWidth + 1 || rect.left < -1) {
        out.push(`${el.tagName.toLowerCase()}.${el.className} ${Math.round(rect.left)}..${Math.round(rect.right)}`);
      }
    }
    return out;
  });
}

test.describe("every screen renders at 390px", () => {
  test.use({ viewport: PHONE });

  for (const route of ROUTES) {
    const path = route.example ?? route.path;
    test(`${route.name} (screen ${route.screen}, frame ${route.frame}) at ${path}`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto(path);

      // Something of the app is on screen. The reading route waits for its
      // own passage, which arrives from the engine rather than from React.
      if (route.path === "/") await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });
      else await expect(page.locator("body")).toContainText(/\S/);
      // "Something rendered" is not enough: an unrouted path renders the
      // not-found screen, which has text on it and would sail through the
      // check above. Watched red by deleting a case from App.tsx's switch.
      await expect(page.locator("body")).not.toContainText("There's nothing here.");

      expect(await widerThanThePhone(page), `${path} runs off the side at 390px`).toEqual([]);

      expect(errors, `${path} logged errors`).toEqual([]);
    });
  }
});

test.describe("every screen renders in the dark", () => {
  test.use({ viewport: PHONE, colorScheme: "dark" });

  for (const route of ROUTES) {
    const path = route.example ?? route.path;
    test(`${route.name} in the dark at ${path}`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto(path);
      if (route.path === "/") await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });
      else await expect(page.locator("body")).toContainText(/\S/);
      // "Something rendered" is not enough: an unrouted path renders the
      // not-found screen, which has text on it and would sail through the
      // check above. Watched red by deleting a case from App.tsx's switch.
      await expect(page.locator("body")).not.toContainText("There's nothing here.");

      // The dark papers are real: the page's own background is dark, not
      // the light default with dark text sitting on it.
      const luminance = await page.evaluate(() => {
        const rgb = getComputedStyle(document.body).backgroundColor.match(/\d+/g) ?? ["255", "255", "255"];
        const [r, g, b] = rgb.map(Number);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      });
      expect(luminance, `${path} is not dark in dark mode`).toBeLessThan(90);

      expect(errors, `${path} logged errors in the dark`).toEqual([]);
    });
  }
});

// Reachability, which is the DONE list's first item. Not "the route exists"
// -- a link a finger can actually follow, from the first screen a new
// reader sees through to each room.
test.describe("the walk", () => {
  test.use({ viewport: PHONE });

  test("first open ends on a passage", async ({ page }) => {
    await page.goto("/welcome");
    await page.getByRole("button", { name: "Start" }).click();
    await page.getByRole("button", { name: "Something short" }).click();
    await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });
  });

  test("reading leads to the Shelf, and the Shelf to every other room", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("link", { name: "Shelf" }).click();
    await expect(page).toHaveURL(/\/shelf$/);

    for (const [label, url] of [
      ["Library", /\/library$/],
      ["Rhyme", /\/rhyme$/],
      ["Assoc.", /\/association$/],
      ["Elevated", /\/elevated$/],
    ] as const) {
      await page.goto("/shelf");
      await page.getByRole("link", { name: label }).click();
      await expect(page).toHaveURL(url);
    }

    // Settings, and the two screens only reachable through it.
    await page.goto("/shelf");
    await page.getByRole("navigation", { name: "Rooms" }).getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await page.getByRole("link", { name: /Voice/ }).click();
    await expect(page).toHaveURL(/\/voice$/);

    await page.goto("/settings");
    await page.getByRole("link", { name: /Account/ }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("the library reaches a book, and a book reaches its own pages", async ({ page }) => {
    await page.goto("/library");
    await page.getByRole("button", { name: /Meditations/ }).first().click();
    await expect(page).toHaveURL(/\/book\/meditations$/);
    await page.getByRole("button", { name: "Begin" }).click();
    await expect(page).toHaveURL(/\/book\/meditations\/read$/);
  });
});

// Law 3 does not stop at the reading screen. The challenge rooms may look
// like challenges; the Shelf, the library and a book's own page may not.
test.describe("the quiet screens stay quiet", () => {
  test.use({ viewport: PHONE });

  const FORBIDDEN = ["streak", "score", "level", "review queue", "learn", "study", "memory", "brain"];

  // The carve-out this absolute needs, found by watching it fail: the words
  // above are forbidden to the *app*, not to the literature. Booker T.
  // Washington writes "engraved upon my memory" and Marcus Aurelius opens
  // with "I learned good morals" -- neither is Superb narrating anything.
  // So the quoted text is subtracted before the sweep, and what is left is
  // exactly the app's own voice.
  const QUOTED = [
    ".passage-text",
    ".sb-passage",
    ".whole-book__verse",
    ".book-opening__line",
    ".share-card__line",
  ].join(", ");

  for (const path of ["/", "/shelf", "/library", "/book/meditations", "/book/up-from-slavery/read"]) {
    test(`no pedagogy narrated on ${path}`, async ({ page }) => {
      await page.goto(path);
      if (path === "/") await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });

      let text = await page.locator("body").innerText();
      const quoted = await page.locator(QUOTED).allInnerTexts();
      for (const passage of quoted) text = text.split(passage).join(" ");
      text = text.toLowerCase();

      for (const word of FORBIDDEN) expect(text, `${path} says "${word}"`).not.toContain(word);
    });
  }
});
