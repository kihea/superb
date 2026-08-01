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

  // The clause is reachability, and a route map is not a walk: screen 14
  // was in ROUTES, rendered fine, passed its dark check, and no reader
  // could get to it. This walks the only way in that frame 1v allows.
  test("holding a sentence is the way to screen 14, and the only way", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });

    // Nothing on the reading page advertises it before the hold.
    await expect(page.locator(".hold-menu")).toHaveCount(0);
    expect(await page.locator('a[href*="share"]').count()).toBe(0);

    const sentence = page.locator(".passage-sentence").first();
    const box = await sentence.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + 20, box!.y + 6);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();

    const menu = page.locator(".hold-menu");
    await expect(menu).toBeVisible();
    // A hold is not a tap: the word under the finger must not have opened.
    await expect(page.locator(".gloss-card")).toHaveCount(0);

    await menu.getByRole("menuitem", { name: "Send to someone" }).click();
    await expect(page).toHaveURL(/\/share$/);
    await expect(page.locator(".share-card")).toBeVisible();
  });

  test("no screen in the route map is reachable only by typing its address", async ({ page }) => {
    // Every route except the two doors a reader arrives through (`/`, and
    // `/welcome` on a first open) must be linked to from somewhere. This
    // is the cheap general form of the check above -- it does not prove a
    // path is walkable, but it does catch a screen nobody links to at all.
    const linked = new Set<string>();
    for (const route of ROUTES) {
      await page.goto(route.example ?? route.path);
      for (const href of await page.locator("a[href^='/']").evaluateAll((els) =>
        els.map((el) => el.getAttribute("href") ?? ""),
      )) {
        linked.add(href);
      }
      // Controls that navigate without being links -- the hold menu's Send,
      // the Shelf's covers -- are covered by the walks above; this sweep
      // only reads anchors.
    }

    const orphans = ROUTES.filter((route) => route.path !== "/" && route.path !== "/welcome")
      .filter((route) => !route.path.includes(":"))
      .filter((route) => ![...linked].some((href) => href === route.path))
      .map((route) => route.path);
    // `/share` is deliberately absent from every anchor in the app: frame
    // 1v says nothing advertises it. The walk above is what covers it.
    expect(orphans).toEqual(["/share"]);
  });

  test("the library reaches a book, and a book reaches its own pages", async ({ page }) => {
    await page.goto("/library");
    // Slice 1A (PLAN.md §7): the real catalogue artifact, not v0mock --
    // book-reading-spine.spec.ts covers this same path with the acceptance
    // spine's own depth (gloss, encounter, resume, offline); this walk only
    // needs reachability.
    await page.getByRole("button", { name: /Dracula/ }).first().click();
    await expect(page).toHaveURL(/\/book\/bram-stoker_dracula$/);
    await page.getByRole("button", { name: "Begin" }).click();
    await expect(page).toHaveURL(/\/book\/bram-stoker_dracula\/read$/);
  });
});

// Two defects a screenshot found and no check could see. Both are about a
// cover, and both are properties rather than pixels, so they can be checked.
test.describe("covers", () => {
  test.use({ viewport: PHONE });

  test("no cover clips its own title", async ({ page }) => {
    await page.goto("/library");
    await expect(page.locator(".cover__title").first()).toBeVisible();

    // The title element is not what overflows -- it sizes to its own text.
    // The cover clips it, with `overflow: hidden`. So the question is
    // whether the title's box still fits inside the cover's, which is the
    // thing a reader sees go wrong. (Measuring the title's own
    // scrollHeight, as the first draft did, sees nothing at all.)
    const clipped = await page.locator(".sb-cover").evaluateAll((covers) =>
      covers
        .map((cover) => {
          const title = cover.querySelector(".cover__title");
          if (!title) return null;
          const box = cover.getBoundingClientRect();
          const inner = title.getBoundingClientRect();
          const style = getComputedStyle(cover);
          const room = {
            bottom: box.bottom - parseFloat(style.paddingBottom),
            right: box.right - parseFloat(style.paddingRight),
          };
          const over = Math.max(inner.bottom - room.bottom, inner.right - room.right);
          return over > 1 ? `${title.textContent} overflows by ${Math.round(over)}px` : null;
        })
        .filter(Boolean),
    );
    expect(clipped, "covers cutting their titles off").toEqual([]);
  });

  // "Finished = frosted, not faded" (1h): still legible, no longer bright.
  // Written as `opacity: 0.66` it did not do that -- on the night Shelf a
  // finished book was the brightest object on the page, brighter than the
  // one being read, because the sage cloth token is pale in the dark theme
  // and fading barely touched it.
  //
  // The invariant, which holds whichever paper is on and whatever colour a
  // cover's cloth happens to be: frosting must close at least half the
  // distance between the cloth and the page behind it. Comparing finished
  // covers to other covers cannot work -- cloth colours legitimately differ,
  // and a pale live cover would fail an honest build. Comparing a cover to
  // its own unfrosted self is the thing being claimed.
  //
  // Watched red both ways: with `opacity: 0.66; filter: saturate(0.2)` and
  // no veil, the light Shelf closes 34% of the distance and the dark Shelf
  // 37%, and both themes fail this test.
  for (const scheme of ["light", "dark"] as const) {
    test(`a finished book recedes rather than shouts: ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/shelf");
      await expect(page.locator(".sb-cover--finished").first()).toBeVisible();

      const brightness = await page.evaluate(() => {
        // Two computed forms, and they are not on the same scale: `rgb()`
        // gives 0-255, and a `color-mix()` result resolves to
        // `color(srgb 0.96 0.93 0.89 / 0.68)`, 0-1. Reading the second as
        // the first turns a pale veil into near-black, which is how the
        // first draft of this check reported a frosted cover as further
        // from the page than its own cloth.
        const parse = (value: string) => {
          const parts = (value.match(/[\d.]+/g) ?? ["0", "0", "0"]).map(Number);
          const scale = value.startsWith("color(") ? 255 : 1;
          return {
            r: parts[0] * scale,
            g: parts[1] * scale,
            b: parts[2] * scale,
            a: parts.length > 3 ? parts[3] : 1,
          };
        };
        const luminance = (c: { r: number; g: number; b: number }) =>
          0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

        // What the reader actually sees, not what one declaration says: the
        // cover's own cloth with its ::after veil composited over it. The
        // veil is where the frost lives, and the element's own
        // backgroundColor cannot see it.
        const seen = (el: Element) => {
          const cloth = parse(getComputedStyle(el).backgroundColor);
          const veil = parse(getComputedStyle(el, "::after").backgroundColor);
          const opacity = Number(getComputedStyle(el).opacity);
          const over = {
            r: veil.r * veil.a + cloth.r * (1 - veil.a),
            g: veil.g * veil.a + cloth.g * (1 - veil.a),
            b: veil.b * veil.a + cloth.b * (1 - veil.a),
          };
          // A cover drawn at less than full opacity is composited against
          // the page behind it -- which is precisely how "faded" inverted.
          const behind = parse(getComputedStyle(document.body).backgroundColor);
          return luminance({
            r: over.r * opacity + behind.r * (1 - opacity),
            g: over.g * opacity + behind.g * (1 - opacity),
            b: over.b * opacity + behind.b * (1 - opacity),
          });
        };

        const pageLuminance = luminance(parse(getComputedStyle(document.body).backgroundColor));
        return [...document.querySelectorAll(".sb-cover--finished")].map((el) => ({
          title: el.textContent ?? "",
          // Its own cloth, before anything is laid over it.
          cloth: Math.abs(luminance(parse(getComputedStyle(el).backgroundColor)) - pageLuminance),
          frosted: Math.abs(seen(el) - pageLuminance),
        }));
      });

      expect(brightness.length).toBeGreaterThan(0);
      for (const cover of brightness) {
        const closed = 1 - cover.frosted / cover.cloth;
        expect(
          closed,
          `${cover.title} closes only ${Math.round(closed * 100)}% of the way to the page in ${scheme}`,
        ).toBeGreaterThanOrEqual(0.5);
      }
    });
  }
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

  // `/share` is here now: it is a reading surface, not a challenge room,
  // and it was the one such surface the sweep did not cover. The challenge
  // rooms stay out on purpose -- tiers and counts are licensed there.
  for (const path of [
    "/",
    "/shelf",
    "/library",
    "/book/bram-stoker_dracula",
    "/book/bram-stoker_dracula/read",
    "/share",
  ]) {
    test(`no pedagogy narrated on ${path}`, async ({ page }) => {
      await page.goto(path);
      if (path === "/") await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });

      let text = await page.locator("body").innerText();
      // `.filter(Boolean)` is load-bearing, not tidiness. An empty match
      // makes `allInnerTexts()` return "", and `text.split("")` shatters
      // the whole page into single characters, after which no
      // `toContain(word)` can ever match again -- the sweep passes green
      // on any screen at all. An empty `.sb-passage` is one bad v0mock row
      // away. Watched: with an empty passage element on the Shelf and a
      // narrated streak beside it, this test passed until this line.
      const quoted = (await page.locator(QUOTED).allInnerTexts()).filter(Boolean);
      for (const passage of quoted) text = text.split(passage).join(" ");
      text = text.toLowerCase();

      for (const word of FORBIDDEN) expect(text, `${path} says "${word}"`).not.toContain(word);
    });
  }
});
