// The register decision, receipted 2026-07-27 (workspace/decisions/
// README.md, private root): Kihea chose "a little of his own hand" from
// three built candidates. Two of the three drawn motifs that choice shipped
// -- the margin mark and the passage-break chain -- were removed by issue
// #111 (his own review of the deployed desktop reading view: "the left
// weird design," "the wiggling lines under the passage") and ADR-041's
// independent rule against static ornament in the text column. What is
// left of the register is the hand-drawn nav icon on the pull-up button;
// these checks now guard that one, plus the law-3 sweeps that were never
// motif-specific to begin with.
import { test, expect, type Page } from "@playwright/test";

/** The engine's own record of which words in the passage on screen are its
 *  first contact (`Passage.seeded`), read straight out of IndexedDB the same
 *  way reading.spec.ts's `readTopicTally` reads the tally -- not through the
 *  app's own rendering, so the test cannot pass just because the app agrees
 *  with itself about what it drew. */
async function currentPassageSeeded(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      // No version pinned: this only reads, and Slice 1A (PLAN.md §7)
      // bumped the shell's own schema to version 2 (storage/db.ts's own
      // BOOK_STORE) -- opening at a fixed version here would throw a
      // VersionError once the app itself has upgraded the database past it.
      const req = indexedDB.open("superb-web");
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

  // The doodle motif is marked aria-hidden and is not focusable or
  // clickable -- a drawn register must not add a second interaction to a
  // screen law 3 says has exactly one kind of target. And -- the
  // containment half, not just the interaction half -- it is never inside
  // .passage-text: a mark's *position* connecting to a particular word is
  // exactly what law 3 forbids, independent of whether the mark is itself
  // tappable. A verifier mutation test once caught this gap for the
  // (since-removed) break chain specifically, moved inside .passage-text
  // with all tests still passing -- this assertion is why that class of
  // gap cannot recur for whatever drawn motif remains.
  for (const selector of [".doodle-arrow"]) {
    const nodes = page.locator(selector);
    await expect(nodes.first()).toHaveAttribute("aria-hidden", "true");
    const tabIndex = await nodes.first().evaluate((el) => el.getAttribute("tabindex"));
    expect(tabIndex).toBeNull();
    expect(await page.locator(`.passage-text ${selector}`).count()).toBe(0);
  }
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

/** Every reader-facing digit on the reading screen, across every channel a
 *  browser can paint a number through and this test can actually audit:
 *
 *    - DOM text, anywhere it lives -- the main document, any *open* shadow
 *      root (a closed one is opaque even to this, which is the one gap a
 *      closed shadow root would leave; nothing in this app opens one), and
 *      any *same-origin* iframe's own document (recursed the same way,
 *      `srcdoc` included).
 *    - Generated content on `::before`/`::after`/`::marker`.
 *    - A rendered list item's own UA-drawn number or bullet. This can't be
 *      read out of computed style at all -- `content` on a UA marker
 *      reports `normal`, not the digit it paints -- so it is forbidden by
 *      existence instead: nothing on this surface may render as a visible
 *      `display: list-item` with `list-style-type` other than `none`.
 *    - Visible form controls' `value`, `placeholder`, and (for `<select>`)
 *      the selected option's own text.
 *    - Canvas pixels, forbidden the same way list markers are: nothing can
 *      read what a canvas painted, so nothing may sit on this surface as a
 *      canvas except the voice orb's own (`.voice-orb`) -- any other one is
 *      a violation by existence, not by content.
 *    - A cross-origin iframe is a violation by existence too, for the same
 *      reason: its content cannot be reached from here to be audited at
 *      all, so it may not sit on this surface either.
 *
 *  Two channels are named rather than closed, because closing them would
 *  forbid things this surface may legitimately need later: the sanctioned
 *  orb canvas's own pixels (it is allowed to exist; what it paints is not
 *  re-audited here), and image content (`<img>`, `background-image`) --
 *  nothing renders one today, but nothing structurally forbids one either.
 *  Both are residual, honest bounds, not oversights. */
async function readerFacingNumberViolations(page: Page): Promise<{ route: string; selector: string; text: string }[]> {
  return page.evaluate(() => {
    type Violation = { route: string; selector: string; text: string };
    const violations: Violation[] = [];

    // Only meaningful against the main document -- the passage never
    // renders into a shadow root or an iframe, so an element from either
    // fails this by construction (`Node.contains` does not cross those
    // boundaries), without needing its own branch to say so.
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
    const isPermittedClass = (el: Element): boolean =>
      el.classList.contains("hold-menu__count") || el.classList.contains("passage-citation");
    const describe = (el: Element): string =>
      `${el.tagName.toLowerCase()}${el.classList.length ? "." + [...el.classList].join(".") : ""}`;
    const isVisible = (el: Element): boolean => el.getClientRects().length > 0;

    const visitedRoots = new Set<Node>();

    function scan(root: Node, label: string): void {
      if (visitedRoots.has(root)) return;
      visitedRoots.add(root);

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = (node.textContent ?? "").trim();
        if (!text || !/\d/.test(text)) continue;
        // `parentElement` is null when the direct parent isn't an Element --
        // a Text node set straight onto a ShadowRoot via `.textContent` has
        // exactly this shape, and `continue`-ing past a null element here
        // was a real gap: neither exemption is keyed to anything but an
        // Element, so no element to check against means no exemption
        // applies, not that the text is safe to skip.
        const el = node.parentElement;
        if (el && (isPassageProse(el) || isPermittedClass(el))) continue;
        violations.push({ route: `${label} text`, selector: el ? describe(el) : "(no element parent)", text });
      }

      const elements = (root as ParentNode).querySelectorAll("*");
      for (const el of elements) {
        for (const pseudo of ["::before", "::after", "::marker"] as const) {
          const content = getComputedStyle(el, pseudo).content;
          const text = (content ?? "").replace(/^"|"$/g, "");
          if (/\d/.test(text)) violations.push({ route: `${label} pseudo`, selector: `${describe(el)}${pseudo}`, text });
        }

        const cs = getComputedStyle(el);
        if (cs.display === "list-item" && cs.listStyleType !== "none" && isVisible(el)) {
          violations.push({ route: `${label} list-item`, selector: describe(el), text: "(UA list marker)" });
        }

        if (el.tagName === "CANVAS" && !el.classList.contains("voice-orb")) {
          violations.push({ route: `${label} canvas`, selector: describe(el), text: "(unaudited canvas)" });
        }

        if ((el.tagName === "INPUT" || el.tagName === "TEXTAREA") && isVisible(el)) {
          const value = (el as HTMLInputElement | HTMLTextAreaElement).value;
          const placeholder = el.getAttribute("placeholder") ?? "";
          if (/\d/.test(value)) violations.push({ route: `${label} value`, selector: describe(el), text: value });
          if (/\d/.test(placeholder)) {
            violations.push({ route: `${label} placeholder`, selector: describe(el), text: placeholder });
          }
        }
        if (el.tagName === "SELECT" && isVisible(el)) {
          const select = el as HTMLSelectElement;
          const selected = select.options[select.selectedIndex]?.text ?? "";
          if (/\d/.test(selected)) violations.push({ route: `${label} select`, selector: describe(el), text: selected });
        }

        // Not visited by the walker or querySelectorAll above at all --
        // each is its own node tree and needs its own recursion.
        if (el.shadowRoot) scan(el.shadowRoot, `${label} > shadow(${describe(el)})`);
        if (el.tagName === "IFRAME") {
          let doc: Document | null = null;
          try {
            doc = (el as HTMLIFrameElement).contentDocument;
          } catch {
            doc = null;
          }
          if (!doc) {
            violations.push({
              route: `${label} iframe`,
              selector: describe(el),
              text: "(cross-origin iframe, cannot be audited)",
            });
          } else if (doc.body) {
            scan(doc.body, `${label} > iframe(${describe(el)})`);
          }
        }
      }
    }

    scan(document.body, "document");
    return violations;
  });
}

// ADR-039's bound on issue #102: the held sentence's own "· N new" is law
// 3's first and only named exception -- the count of *that sentence's*
// first-contact words, in the menu the reader's own hold raised, nothing
// wider. This does not merely carry the exception in a comment; it asserts
// the count is the *only* reader-facing number anywhere in the document
// once a sentence is held, and that it is actually the right number (a
// sweep that only watches for extras would still pass with the exception
// quietly gutted to always read zero).
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

  const violations = await readerFacingNumberViolations(page);
  expect(violations, "a number faced the reader outside the one sanctioned exception").toEqual([]);
});

// The seam audit (ADVISORY-008 §5 item 4): the drawn motif that remains may
// not itself be an animation running behind the text, in either colour
// scheme. Printed still, per DERIVATION-001's own shape rule.
for (const scheme of ["dark", "light"] as const) {
  test(`the doodle motifs are printed still, not animating: ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);

    for (const selector of [".doodle-arrow-stroke"]) {
      const animationName = await page
        .locator(selector)
        .first()
        .evaluate((el) => getComputedStyle(el).animationName);
      expect(animationName).toBe("none");
    }
  });
}
