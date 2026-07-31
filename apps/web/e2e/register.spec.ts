// The register decision, receipted 2026-07-27 (workspace/decisions/
// README.md, private root): Kihea chose "a little of his own hand" from
// three built candidates -- item 7 is discharged, and that choice is now
// the only screen that exists. These checks (originally written across
// all three candidates while the choice was still open) now guard the one
// that shipped: the margin mark, the passage-break chain with its dropped
// tooth, and the hand-drawn nav icon on the pull-up button.
import { test, expect, type Page } from "@playwright/test";

/** The engine's own record of which words in the passage on screen are its
 *  first contact (`Passage.seeded`), read straight out of IndexedDB the same
 *  way reading.spec.ts's `readTopicTally` reads the tally -- not through the
 *  app's own rendering, so the test cannot pass just because the app agrees
 *  with itself about what it drew. */
async function currentPassageSeeded(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("superb-web", 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const raw = await new Promise<{ seeded?: string[] } | undefined>((resolve, reject) => {
      const tx = db.transaction("engine", "readonly");
      const req = tx.objectStore("engine").get("currentPassage");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return raw?.seeded ?? [];
  });
}

test("renders the real passage, decorative motifs never become tap targets", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });

  // Every word is still the same identical button -- no drawn motif is
  // allowed to reach into the passage text itself.
  const words = page.locator(".passage-word");
  expect(await words.count()).toBeGreaterThan(20);
  const classNames = await words.evaluateAll((els) => [...new Set(els.map((el) => el.className))]);
  expect(classNames).toEqual(["passage-word"]);

  // The doodle motifs are marked aria-hidden and are not focusable or
  // clickable -- a drawn register must not add a fourth interaction to a
  // screen law 3 says has exactly one kind of target. And -- the
  // containment half, not just the interaction half -- none of them is
  // ever inside .passage-text: a mark's *position* connecting to a
  // particular word is exactly what law 3 forbids, independent of whether
  // the mark is itself tappable. A verifier mutation test caught this gap
  // for BreakChain specifically (moved it inside .passage-text, all tests
  // still passed) -- DoodleArrow already had this assertion on its own
  // (below); MarginMark and BreakChain did not, until now.
  for (const selector of [".margin-mark", ".break-chain", ".doodle-arrow"]) {
    const nodes = page.locator(selector);
    await expect(nodes.first()).toHaveAttribute("aria-hidden", "true");
    const tabIndex = await nodes.first().evaluate((el) => el.getAttribute("tabindex"));
    expect(tabIndex).toBeNull();
    expect(await page.locator(`.passage-text ${selector}`).count()).toBe(0);
  }
});

// The dropped tooth is chosen once and fixed, not randomised per render
// (DERIVATION-001) -- two independent loads must draw the identical number
// of chain links.
test("the break chain's dropped tooth is stable across reloads, not randomised", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });
  const first = await page.locator(".break-chain-link").count();
  expect(first).toBeGreaterThan(0);

  await page.reload();
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });
  const second = await page.locator(".break-chain-link").count();

  expect(first).toBe(second);
});

// The nav-icon boundary from Kihea's own direction (2026-07-27): a drawn
// icon may decorate an existing chrome action, but it must never sit
// inside the text column or become a second interactive target of its
// own -- the same law-3 line the passage-break chain's placement already
// has to hold.
test("the doodle nav icon decorates the pull-up button, never the passage text", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });

  expect(await page.locator(".passage-text .doodle-arrow").count()).toBe(0);

  const icon = page.locator(".passage-continue-button .doodle-arrow");
  await expect(icon).toHaveCount(1);
  await expect(icon).toHaveAttribute("aria-hidden", "true");
  const tabIndex = await icon.evaluate((el) => el.getAttribute("tabindex"));
  expect(tabIndex).toBeNull();
});

// The general law-3 sweep, reused from reading.spec.ts's own topic-
// affinity check: the drawn register must not be the thing that quietly
// leaks the schedule.
test("the drawn register does not narrate its own pedagogy in rendered text", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });
  const bodyText = (await page.locator("body").innerText()).toLowerCase();
  for (const word of ["topic", "affinity", "streak", "score", "level", "review queue"]) {
    expect(bodyText).not.toContain(word);
  }
});

// ADR-039's bound on issue #102: the held sentence's own "· N new" is law
// 3's first and only named exception -- the count of *that sentence's*
// first-contact words, in the menu the reader's own hold raised, nothing
// wider. This does not merely carry the exception in a comment; it asserts
// the count is the *only* reader-facing number anywhere in the document
// once a sentence is held, and that it is actually the right number (a
// sweep that only watches for extras would still pass with the exception
// quietly gutted to always read zero). Watched red both ways in review:
// once with HoldMenu's count stripped back out, and once with an
// unrelated digit added somewhere else on the reading screen.
test("the held sentence's new-word count is the only number facing the reader", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });

  const seeded = new Set((await currentPassageSeeded(page)).map((w) => w.toLowerCase()));

  // Read the same token structure PassagePage itself renders from (one
  // .passage-word per token, grouped under .passage-sentence) rather than
  // re-deriving sentence text with a regex of our own -- this is the exact
  // thing PassagePage.tsx's own `countNew` counts, not an approximation of
  // it that could quietly drift from what the component actually does.
  const sentenceWords = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".passage-sentence")).map((sentence) =>
      Array.from(sentence.querySelectorAll(".passage-word")).map((word) => word.textContent ?? ""),
    ),
  );
  const held = sentenceWords.findIndex((words) => words.some((word) => seeded.has(word.toLowerCase())));
  expect(held, "no sentence in this passage held a first-contact word to hold against").toBeGreaterThanOrEqual(0);
  const expectedCount = new Set(
    sentenceWords[held].map((word) => word.toLowerCase()).filter((word) => seeded.has(word)),
  ).size;

  const box = await page.locator(".passage-sentence").nth(held).boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 10, box!.y + 6);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();

  const menu = page.locator(".hold-menu");
  await expect(menu).toBeVisible();
  await expect(page.locator(".hold-menu__count")).toHaveText(new RegExp(`^\\s*·\\s*${expectedCount}\\s*new$`));

  // Every other digit anywhere near the reader: the passage's own prose is
  // excluded, the same way reading.spec.ts's topic-affinity test excludes
  // the passage's own topic word -- content a book or a composed template
  // legitimately carries is not a measurement of the reader, and is not
  // what law 3 is about. The citation year (ADR-023) is the other named
  // legitimate case. Anything left over is unexplained.
  //
  // A review attacked the first version of this sweep and won three ways,
  // all reproduced and closed here:
  //
  //   1. The exclusions were substring class checks (`.includes(...)`), so
  //      an unrelated class merely *containing* "passage-citation" or
  //      "hold-menu__count" escaped. `classList.contains` is exact per
  //      class token instead.
  //   2. "Passage prose" was any DOM descendant of `.passage-text`, which a
  //      `position: fixed` badge nested inside the paragraph satisfies
  //      while rendering nowhere near the actual text. Prose now also has
  //      to be geometrically inside the passage's own rendered box -- a
  //      fixed-position escape fails that regardless of where it sits in
  //      the DOM.
  //   3. `::before`/`::after` generated content is invisible to a DOM text
  //      walker by construction. There is no legitimate reason for a
  //      pseudo-element to carry a digit on this surface at all, so this
  //      now scans computed pseudo-element content too and treats any
  //      digit found there as unexplained, unconditionally.
  //
  // The lesson that produced this list: watching the sweep go red proves
  // the mechanism fires, not that the exclusions are the right shape --
  // each carve-out has to be attacked on its own before it can be trusted.
  const digitNodes = await page.evaluate(() => {
    const out: { selector: string; text: string }[] = [];

    const passageText = document.querySelector(".passage-text");
    const passageRect = passageText?.getBoundingClientRect();
    const isPassageProse = (el: Element): boolean => {
      if (!passageText || !passageRect || !passageText.contains(el)) return false;
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      const pad = 1; // sub-pixel rounding, not a loophole width.
      return (
        r.left >= passageRect.left - pad &&
        r.right <= passageRect.right + pad &&
        r.top >= passageRect.top - pad &&
        r.bottom <= passageRect.bottom + pad
      );
    };
    const describe = (el: Element): string =>
      `${el.tagName.toLowerCase()}${el.classList.length ? "." + [...el.classList].join(".") : ""}`;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? "").trim();
      if (!text || !/\d/.test(text)) continue;
      const el = node.parentElement;
      if (!el) continue;
      if (isPassageProse(el)) continue;
      if (el.classList.contains("hold-menu__count") || el.classList.contains("passage-citation")) continue;
      out.push({ selector: describe(el), text });
    }

    for (const el of document.querySelectorAll("*")) {
      for (const pseudo of ["::before", "::after"] as const) {
        const content = getComputedStyle(el, pseudo).content;
        const text = content.replace(/^"|"$/g, "");
        if (/\d/.test(text)) out.push({ selector: `${describe(el)}${pseudo}`, text });
      }
    }

    return out;
  });
  expect(digitNodes, "a number faced the reader outside the one sanctioned exception").toEqual([]);
});

// The seam audit (ADVISORY-008 §5 item 4): none of the three drawn motifs
// may itself be an animation running behind the text, in either colour
// scheme. Printed still, per DERIVATION-001's own shape rule.
for (const scheme of ["dark", "light"] as const) {
  test(`the doodle motifs are printed still, not animating: ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);

    for (const selector of [".margin-mark-stroke", ".break-chain-link", ".doodle-arrow-stroke"]) {
      const animationName = await page
        .locator(selector)
        .first()
        .evaluate((el) => getComputedStyle(el).animationName);
      expect(animationName).toBe("none");
    }
  });
}
