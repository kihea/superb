// Proves the loop docs/seams.md names -- plan -> fetch -> decide -> save ->
// render -- actually runs end to end, against a real production build
// (playwright.config.ts builds and serves dist/, not the dev server).
// The engine-composed reading state now lives at /play/prose, behind the
// prose game's door -- "/" is the Shelf. Everything below walks in through
// that door (see prose.ts) and then audits the same surface it always did.
import { test, expect, type Page } from "@playwright/test";
import { openProse, reopenProse } from "./prose";

async function currentPassageId(page: Page): Promise<string | null> {
  return page.locator(".passage-page").getAttribute("data-passage-id");
}

/** The pull-up bar starts at opacity 0 / pointer-events: none and only
 *  becomes interactive once its IntersectionObserver fires (nearEnd) and
 *  the CSS transition to --visible settles. `scrollIntoViewIfNeeded` does
 *  not wait for that -- it is a layout/visibility check, not a
 *  transition-complete check -- so clicking immediately after it raced the
 *  transition under heavy parallel-worker CPU load and intermittently
 *  clicked whatever was underneath instead (the article, since the button
 *  can legitimately overlap the card's own bottom padding at some viewport
 *  sizes). Waiting for the class directly, rather than a fixed timeout, is
 *  what makes this reliable regardless of how loaded the machine is. */
async function clickKeepReading(page: Page): Promise<void> {
  await page.locator(".passage-continue-button").scrollIntoViewIfNeeded();
  await expect(page.locator(".passage-continue")).toHaveClass(/passage-continue--visible/, {
    timeout: 15_000,
  });
  await page.locator(".passage-continue-button").click();
}

// WCAG 2.x contrast, computed from the specified colours rather than
// sampled pixels -- the standard method (axe-core and Lighthouse both work
// this way) and the right one here, since what is being guarded against is
// a *token* pointed at the wrong palette, not a rendering artefact.
function relativeLuminance([r, g, b]: number[]): number {
  const channel = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channel[0] + 0.7152 * channel[1] + 0.0722 * channel[2];
}
function contrastRatio(a: number[], b: number[]): number {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
function parseRgb(value: string): number[] {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) throw new Error(`not an rgb()/rgba() colour: ${value}`);
  return match[1].split(",").slice(0, 3).map(Number);
}
const AA_BODY_TEXT = 4.5;

/** What a reader's eye actually resolves an element's background to --
 *  walks up from the element until it finds a non-transparent
 *  background-color, the way a browser's own paint does. */
async function effectiveBackground(page: Page, selector: string): Promise<string> {
  return page.locator(selector).evaluate((start) => {
    let el: Element | null = start;
    while (el) {
      const bg = getComputedStyle(el).backgroundColor;
      const isTransparent = bg === "rgba(0, 0, 0, 0)" || bg === "transparent";
      if (!isTransparent) return bg;
      el = el.parentElement;
    }
    return "rgb(255, 255, 255)"; // browser default, if nothing ever painted one.
  });
}

interface TopicTally {
  finished: number;
  abandoned: number;
}

/** Reads the real engine's persisted `LearnerState` document straight out of
 *  IndexedDB -- not through the app's own code, so this cannot pass just
 *  because the app agrees with itself about what it wrote. `topic_affinities`
 *  is superb-core's own field name for this (ADR-016's v1 envelope,
 *  crates/superb-core/tests/fixtures/learner_state_v1.json), snake_case
 *  because it is the wire shape `Engine.save()` actually produces -- the
 *  mock engine this test used to read used its own private `topicTally`
 *  shape instead, which does not exist once the mock is gone (ADVISORY-014
 *  §1: "the e2e suite exercises the real engine path"). */
async function readTopicTally(page: Page): Promise<[string, TopicTally] | null> {
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
    const raw = await new Promise<string | undefined>((resolve, reject) => {
      const tx = db.transaction("engine", "readonly");
      const req = tx.objectStore("engine").get("state");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { topic_affinities?: Record<string, { finished: number; abandoned: number }> };
    const entries = Object.entries(parsed.topic_affinities ?? {});
    return entries.length > 0 ? entries[0] : null;
  });
}

test("renders a real passage from content/", async ({ page }) => {
  await openProse(page);
  // The same class of infrastructure variance clickKeepReading() already
  // guards against (see its own comment below): six workers hitting one
  // preview server at once can starve the very first paint past the
  // default 5s expect timeout under CI-level CPU contention, with nothing
  // in the app or test logic differing between a passing and failing run.
  // Isolated (one worker), this resolves in about a second.
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });
  const words = page.locator(".passage-word");
  await expect(words.first()).toBeVisible();
  expect(await words.count()).toBeGreaterThan(20);
});

// A screenshot review caught this, not a code review: the passage's own
// entrance animation (passage-arrive) leaves a lingering identity transform
// on .passage-page after it finishes (animation-fill-mode: both keeps the
// final keyframe applied at rest). Any non-`none` transform on an ancestor
// creates a new containing block for position: fixed descendants, so the
// pull-up button and the gloss card's backdrop stopped being fixed to the
// viewport and became fixed to the card instead -- a real contrast failure,
// pale-on-pale. Both are portalled to document.body specifically to escape
// this; these two checks are the regression guard for the geometry half of
// that fix.
test("fixed-position overlays anchor to the real viewport, not the card", async ({ page }) => {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("no viewport");

  await openProse(page);
  await page.locator(".passage-continue-button").scrollIntoViewIfNeeded();
  await expect(page.locator(".passage-continue")).toHaveClass(/passage-continue--visible/, {
    timeout: 15_000,
  });

  const buttonBox = await page.locator(".passage-continue-button").boundingBox();
  expect(buttonBox).not.toBeNull();
  // Within a few px of the true viewport bottom -- if an ancestor's
  // lingering transform hijacked the containing block again, this would
  // land wherever that ancestor's box happens to end instead.
  expect(Math.abs(viewport.height - (buttonBox!.y + buttonBox!.height))).toBeLessThan(30);

  await page.locator(".passage-word").first().click();
  const backdropBox = await page.locator(".gloss-backdrop").boundingBox();
  expect(backdropBox).toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height });
});

// The token half of the same fix: wherever the button ends up, it has to be
// legible. It is always styled from the passage's own page tokens (dark ink
// on warm paper) rather than the surrounding chrome tokens, specifically
// because "wherever it ends up" is not fully controlled by this app -- a
// long passage that scrolls can legitimately put a viewport-fixed bottom bar
// over the card even with correct positioning. The metal treatment
// (design/metal.css) only ever touches the rim; background-color is set
// explicitly alongside it for exactly this reason (PassagePage.css).
test("the pull-up button is always page-toned, not chrome-toned", async ({ page }) => {
  await openProse(page);
  const styles = await page.locator(".passage-continue-button").evaluate((el) => {
    const cs = getComputedStyle(el);
    return { color: cs.color, background: cs.backgroundColor };
  });
  // rgb(242, 238, 231) / rgb(16, 15, 14) -- design/night.css's --ink on
  // --ground. The three interchangeable papers are gone, so this is now a
  // constant rather than one scheme's reading of a pair that moved. What it
  // asserts is unchanged and is the point: the button takes the reading
  // surface's own tokens, never the chrome ones, so it stays legible
  // against whatever the page is rather than against a fixed room colour.
  expect(styles.color).toBe("rgb(242, 238, 231)");
  expect(styles.background).toBe("rgb(16, 15, 14)");
});

// The general form of the same bug: any chrome text left pointed at the
// wrong palette. Found once already while investigating the button --
// .reading-status (the loading and error text) used --chrome-ink-muted, a
// dark-ground colour, while rendering inside .reading-page, the light card.
// Real WCAG contrast, computed from the specified colours (not a
// token-equality check, so it holds even if the token values themselves
// change later), against every chrome-drawn text this build ships.
test("every chrome text on the reading surface meets WCAG AA contrast", async ({ page }) => {
  await openProse(page);

  const buttonContrast = await page.locator(".passage-continue-button").evaluate((el) => {
    const cs = getComputedStyle(el);
    return { fg: cs.color, bg: cs.backgroundColor };
  });
  expect(contrastRatio(parseRgb(buttonContrast.fg), parseRgb(buttonContrast.bg))).toBeGreaterThanOrEqual(
    AA_BODY_TEXT,
  );

  // .reading-status and .passage-citation both read --text-2 and both live
  // inside .reading-page; the pairing is asserted against .reading-page's
  // real effective background rather than chasing .reading-status's own
  // transient mount.
  const readingPageBg = await effectiveBackground(page, ".reading-page");
  const textMutedRgb = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.color = "var(--text-2)";
    document.body.appendChild(probe);
    const rgb = getComputedStyle(probe).color;
    probe.remove();
    return rgb;
  });
  expect(contrastRatio(parseRgb(textMutedRgb), parseRgb(readingPageBg))).toBeGreaterThanOrEqual(AA_BODY_TEXT);

  await page.locator(".passage-word").first().click();
  const glossContrast = await page.locator(".gloss-definition").evaluate((el) => {
    const cs = getComputedStyle(el);
    const card = el.closest(".gloss-card") as HTMLElement;
    return { fg: cs.color, bg: getComputedStyle(card).backgroundColor };
  });
  expect(contrastRatio(parseRgb(glossContrast.fg), parseRgb(glossContrast.bg))).toBeGreaterThanOrEqual(
    AA_BODY_TEXT,
  );
});

test("gloss tap arrives and dismisses", async ({ page }) => {
  await openProse(page);
  // A curated word, not blindly the first one: the "elsewhere" example line
  // exists only for curated entries (GlossCard.tsx's resolution order), and
  // the first word of a passage is usually an article with no entry at all.
  const word = page
    .locator(".passage-word", { hasText: /^(grey|quietly|hush|weathered|steady|faintly)$/ })
    .first();
  await word.click();

  const card = page.locator(".gloss-card");
  await expect(card).toBeVisible();
  await expect(card.locator(".gloss-definition")).not.toBeEmpty();
  await expect(card.locator(".gloss-elsewhere")).not.toBeEmpty();

  // The backdrop covers the whole viewport, including where the tapped word
  // visually sits -- so tapping there again lands on the backdrop, not a
  // second fire of the word's own handler, and dismisses just the same
  // (gloss-interaction.md: "tapping again dismisses it", no confirmation,
  // no cost).
  await card.locator("..").click({ position: { x: 5, y: 5 } });
  await expect(card).not.toBeVisible();
});

test("finish -> next passage -> reload resumes the new one", async ({ page }) => {
  await openProse(page);
  const before = await currentPassageId(page);

  await clickKeepReading(page);
  // The old passage stays mounted while the engine composes the next one
  // (the pixel break runs over the swap), so wait for the id to actually
  // change rather than reading it the instant the click lands -- the same
  // poll reading-state-flourish.spec.ts uses on this exact transition.
  await expect
    .poll(async () => currentPassageId(page), { timeout: 10_000 })
    .not.toBe(before);
  const after = await currentPassageId(page);

  // State persists to IndexedDB (docs/seams.md) -- a reload lands on the
  // prose door again, and opening it must resume the passage just landed
  // on, not start over or advance again.
  await page.reload();
  await reopenProse(page);
  const afterReload = await currentPassageId(page);
  expect(afterReload).toBe(after);
});

// ADR-022 / docs/seams.md's amendment: TopicAffinityUpdated crosses the seam
// on every PassageFinished and must never reach the reader by any route --
// "no display, no 'you've been enjoying...', no topic chips, no Settings
// readout, no debug overlay that survives to production."
//
// This checks the specific finished/abandoned values just written to
// IndexedDB against three independent rendered surfaces: every attribute on
// every element, the accessibility tree (ariaSnapshot -- page.accessibility
// .snapshot() was removed from Playwright; this is the current
// replacement, and it can diverge from both DOM text and DOM attributes,
// since an aria-label changes what a screen reader announces without
// touching either), and exact-match text nodes for the counts themselves.
//
// What this deliberately does NOT do: search for the topic id or label
// itself (e.g. "harbour") anywhere on the page. A first version of this
// test did, and it false-positived immediately -- the passage's own prose
// legitimately contains its topic word ("...before it was lost among the
// masts... the whole harbour seemed to hold its breath"), and so does its
// id (comp-harbour-dawn), for reasons that have nothing to do with a leak.
// The topic word is content; the tally is the secret. Only the numbers, and
// the words "topic"/"affinity" as the feature's own vocabulary, are things
// a passage would never legitimately say.
test("topic affinity tally never reaches any rendered surface", async ({ page }) => {
  await openProse(page);
  await clickKeepReading(page);
  await expect(page.locator(".passage-page")).toBeVisible();

  const tally = await readTopicTally(page);
  expect(tally).not.toBeNull();
  const [, counts] = tally!;
  expect(counts.finished + counts.abandoned).toBeGreaterThan(0);

  // Route 1: rendered text content and the accessibility tree, for the
  // feature's own vocabulary -- words a real passage would not say.
  const bodyText = (await page.locator("body").innerText()).toLowerCase();
  expect(bodyText).not.toContain("topic");
  expect(bodyText).not.toContain("affinity");
  const ariaTree = (await page.locator("body").ariaSnapshot()).toLowerCase();
  expect(ariaTree).not.toContain("topic");
  expect(ariaTree).not.toContain("affinity");

  // Route 2: every attribute value on every element -- data-*, aria-label,
  // title -- for the exact counts, as whole attribute values rather than
  // substrings (a substring check on e.g. "1" would false-positive on any
  // unrelated id or index already on the page).
  const attributeLeak = await page.evaluate(
    ({ finished, abandoned }) => {
      const targets = new Set([String(finished), String(abandoned)]);
      for (const el of Array.from(document.querySelectorAll("*"))) {
        for (const attr of Array.from(el.attributes)) {
          if (targets.has(attr.value)) return `${el.tagName}[${attr.name}]="${attr.value}"`;
        }
      }
      return null;
    },
    counts,
  );
  expect(attributeLeak).toBeNull();

  // Route 3: the counts as exact standalone text nodes -- catches a literal
  // `{finished}` leak without false-positiving on an unrelated number
  // elsewhere on the same screen (a citation year, etc.).
  const numericLeak = await page.evaluate(
    ({ finished, abandoned }) => {
      const targets = new Set([String(finished), String(abandoned)]);
      for (const el of Array.from(document.querySelectorAll("*"))) {
        const ownText = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent?.trim() ?? "")
          .join("");
        if (targets.has(ownText) && ownText !== "") return el.outerHTML.slice(0, 200);
      }
      return null;
    },
    counts,
  );
  expect(numericLeak).toBeNull();
});

interface AuraSnapshot {
  beforeAnimation: string;
  afterAnimation: string;
  beforeOpacity: string;
  afterOpacity: string;
  beforeFilter: string;
  afterFilter: string;
  /** Every running animation whose target is the aura, one of its
   *  pseudo-elements, one of its ancestors, or anything inside it --
   *  including ones no CSS declares (Element.animate, a JS-driven
   *  transition), which is why this is read from the animation timeline
   *  rather than from computed style. */
  running: string[];
  /** The whole resolved appearance and position of the aura's subtree and
   *  ancestor chain, one entry per element per property. Two of these taken a
   *  moment apart differing at all is motion, whatever wrote it. Kept as a
   *  map rather than one long string so a failure can say which element and
   *  which property moved instead of printing every property of every
   *  ancestor at whoever has to read it. */
  appearance: Record<string, string>;
}

/** The entries present in one snapshot and not the other, or present in both
 *  with different values -- the whole difference between two moments, in the
 *  form a reader wants it. */
function drift(from: AuraSnapshot, to: AuraSnapshot): string[] {
  const keys = new Set([...Object.keys(from.appearance), ...Object.keys(to.appearance)]);
  return [...keys]
    .filter((key) => from.appearance[key] !== to.appearance[key])
    .sort()
    .map((key) => `${key}: ${from.appearance[key] ?? "(absent)"} -> ${to.appearance[key] ?? "(absent)"}`);
}

/** `before`/`after` name the aura's own `::before`/`::after` pseudo-elements
 *  (the two lights, ReadingScreen.css) -- not a point in time. `opacity`
 *  and `filter` are the two properties that CSS actually varies on this
 *  element if it is ever made to move; `animationName` is read alongside
 *  them rather than instead, because it catches a different failure mode
 *  (see the assertions this feeds, below).
 *
 *  `appearance` is the general claim the named properties above are only
 *  fast, specific instances of: the full computed style of the aura, both
 *  its pseudo-elements and every ancestor up to <html>, plus each of their
 *  bounding rectangles and scroll offsets. Naming no property means no
 *  mutation can be off the list, and walking the ancestor chain means no
 *  element between the aura and the document root is off the map either --
 *  a transform on a parent moves the aura on screen exactly as one on the
 *  aura itself does. */
async function auraSnapshot(page: Page): Promise<AuraSnapshot> {
  return page.evaluate(() => {
    const el = document.querySelector(".reading-screen-aura");
    if (!el) throw new Error("no .reading-screen-aura in the DOM");
    const before = getComputedStyle(el, "::before");
    const after = getComputedStyle(el, "::after");

    const chain: Element[] = [];
    for (let node: Element | null = el; node; node = node.parentElement) chain.push(node);

    const appearance: Record<string, string> = {
      "window#scroll": `${window.scrollX},${window.scrollY}`,
    };
    const recordStyle = (label: string, target: Element, pseudo?: string): void => {
      const cs = getComputedStyle(target, pseudo);
      for (let i = 0; i < cs.length; i += 1) appearance[`${label} ${cs[i]}`] = cs.getPropertyValue(cs[i]);
    };
    const recordBox = (label: string, target: Element): void => {
      const r = target.getBoundingClientRect();
      appearance[`${label} box`] = `${r.x},${r.y},${r.width},${r.height}`;
      appearance[`${label} scroll`] = `${target.scrollLeft},${target.scrollTop}`;
    };

    // Every ancestor is read three times over: the element, and both of its
    // pseudo-elements. Reading only the element was a real hole -- an
    // ancestor's ::after can be given content, a position and a moving
    // transform without anything about the ancestor's own computed style or
    // border box changing at all, and a verifier drove exactly that with a
    // rAF loop rewriting the CSSOM rule for `.reading-screen::after`.
    chain.forEach((node, depth) => {
      const label = depth === 0 ? "aura" : `ancestor${depth}:${node.tagName}`;
      recordBox(label, node);
      recordStyle(label, node);
      recordStyle(`${label}::before`, node, "::before");
      recordStyle(`${label}::after`, node, "::after");
    });
    // Anything drawn inside the aura, in case the leak is an inserted child
    // rather than a mutation of what is already there.
    appearance["aura#children"] = String(el.querySelectorAll("*").length);
    Array.from(el.querySelectorAll("*")).forEach((child, i) => {
      recordBox(`child${i}:${child.tagName}`, child);
      recordStyle(`child${i}:${child.tagName}`, child);
    });

    const inScope = (target: Element | null | undefined): boolean =>
      !!target && (target.contains(el) || el.contains(target));
    const running = document
      .getAnimations()
      .filter((animation) => animation.playState === "running")
      .filter((animation) => {
        const effect = animation.effect as KeyframeEffect | null;
        return inScope(effect?.target);
      })
      .map((animation) => {
        const effect = animation.effect as KeyframeEffect | null;
        const target = effect?.target;
        return `${animation.constructor.name}:${(animation as { animationName?: string; transitionProperty?: string }).animationName ?? (animation as { transitionProperty?: string }).transitionProperty ?? "anonymous"} on ${target?.tagName}.${target?.className}${effect?.pseudoElement ?? ""}`;
      });

    return {
      beforeAnimation: before.animationName,
      afterAnimation: after.animationName,
      beforeOpacity: before.opacity,
      afterOpacity: after.opacity,
      beforeFilter: before.filter,
      afterFilter: after.filter,
      running,
      appearance,
    };
  });
}

/** The patch of viewport the aura occupies, measured once. Measured once on
 *  purpose: a region recomputed from the aura's own box at each sample would
 *  travel with a moving aura and photograph it in its own frame, where it
 *  looks perfectly still -- the picture equivalent of the bug this whole test
 *  exists to close. The region is a fixed patch of screen; the question is
 *  whether what is painted in it changes.
 *
 *  One exclusion: `.reading-top`, the row carrying the Shelf link and the
 *  voice orb. Kihea decided on issue #99 that the orb may turn quietly the
 *  whole time a passage is on screen -- the one thing on this screen
 *  licensed to move, which is exactly what this photograph exists to catch
 *  everywhere else. Painting over just the orb's own box was tried first
 *  and rejected (see auraPixels' comment on `mask`); shrinking the
 *  photographed region below the whole top row is the smallest change that
 *  avoids it, at the cost of also giving up coverage of the Shelf link and
 *  the rest of the row. That trade needed its own guard rather than a
 *  comment claiming one existed that didn't (a review caught the claim,
 *  not the gap it was covering for) -- see "nothing in the reading page's
 *  top row moves except the orb itself", below, which watches everything
 *  in `.reading-top` other than the orb for a running animation directly.
 *  Everything below the row -- the room, the margin mark, the passage, the
 *  pull-up bar -- is still photographed whole here, nothing painted over. */
async function auraRegion(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator(".reading-screen-aura").boundingBox();
  if (!box) throw new Error("the aura has no box to photograph");
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("no viewport");
  const x = Math.max(0, box.x);
  const y = Math.max(0, box.y);
  const width = Math.min(box.width, viewport.width - x);
  const height = Math.min(box.height, viewport.height - y);

  const topRow = await page.locator(".reading-top").boundingBox();
  if (!topRow) return { x, y, width, height };
  const rowBottom = topRow.y + topRow.height;
  if (rowBottom <= y) return { x, y, width, height };
  return { x, y: rowBottom, width, height: Math.max(0, height - (rowBottom - y)) };
}

/** A picture of that region -- all of it, nothing masked.
 *
 *  An earlier version of this masked out `.reading-page` and
 *  `.passage-continue` on the theory that the card is not what the seam is
 *  about and that card-local rendering might flake. Both halves were wrong.
 *  A mask is a painted-over rectangle, so it is a blind spot with a promise
 *  attached, and those two selectors blanked 62.9% of the photograph --
 *  `.passage-continue` is a full-viewport-width band even though the control
 *  inside it is a small centred pill, so masking it blanked a wide strip of
 *  real periphery. A verifier walked three separate drifting overlays into
 *  those rectangles, in plain view of a reader, and the photographs came back
 *  identical. The flake the mask was insuring against was never measured and
 *  does not exist: unmasked photographs are byte-identical run after run,
 *  because a settled reading screen genuinely does not move. If some future
 *  card-local rendering ever does flake here, mask the measured tight box of
 *  the thing that flakes and say which run proved it -- never a selector
 *  whose box you have not looked at.
 *
 *  `animations: "allow"` is deliberate and load-bearing: Playwright's default
 *  for snapshot comparison is to freeze animations, which is exactly the
 *  evidence being looked for here. Two of these differing by a single byte is
 *  a pixel that changed with nothing happening on screen -- including motion
 *  no style tree can see, like a CSSOM-driven ancestor pseudo-element or an
 *  overlay drifting in from somewhere else in the document entirely.
 *
 *  Playwright's own `mask` option was tried and rejected here, not for the
 *  usual reason (a selector whose box was never measured) but a structural
 *  one: `mask` inserts and removes its own overlay element per screenshot,
 *  which is a document mutation, and check 5 below watches the whole
 *  document for exactly that -- masking the one licensed exception (see
 *  auraRegion) would have failed the unrelated assertion it shares this
 *  test with. See auraRegion for how the exception is actually taken. */
async function auraPixels(
  page: Page,
  clip: { x: number; y: number; width: number; height: number },
): Promise<Buffer> {
  return page.screenshot({ clip, animations: "allow", caret: "hide" });
}

/** Sampling is discrete, and every discrete sampler has gaps between its
 *  looks. These gaps are drawn fresh each run rather than being a constant an
 *  attacker (or an unlucky animation period) could sit between: a 50ms blink
 *  timed to fall in the space between fixed samples evades a fixed schedule
 *  every run, and a random schedule some of the time -- and "some of the time"
 *  is a test that eventually goes red, which is all a regression guard has to
 *  do. The gaps are reported on failure so a red run is still reproducible.
 *
 *  Roughly 2.4s of watching in total, up from 1.2s. Longer is strictly better
 *  here and the cost is seconds; see the honest bound recorded at the test
 *  itself for what a *longer* delay than this window still buys an attacker. */
function sampleGaps(): number[] {
  return Array.from({ length: 11 }, () => 140 + Math.floor(Math.random() * 140));
}

/** Between those looks, this watches continuously.
 *
 *  Sampling and photographing both ask "is it different now than it was
 *  then", which cannot see an event that begins and ends between two looks.
 *  A MutationObserver is not a sampler -- it reports every DOM change as it
 *  happens, so a 50ms blink 1.2s apart is caught by the same mechanism as a
 *  continuous drift. It is scoped to the whole document on purpose: ADR-019's
 *  seam is "material persists, events stop while a passage is on screen", and
 *  the honest mechanisation of "events stop" is that nothing in the document
 *  mutates at all. Anything that legitimately needs to mutate while a passage
 *  sits untouched on screen is a change to that seam, and should have to come
 *  and argue with this test.
 *
 *  What it cannot see: a change made through the CSSOM (rewriting a style
 *  rule's properties mutates no node), which is why the layers that resolve
 *  computed style and photograph pixels are not replaced by it. */
async function watchDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target as Element;
        const name = `${target.nodeName}${target.className ? `.${String(target.className).split(" ")[0]}` : ""}`;
        const what =
          record.type === "attributes"
            ? `attribute ${record.attributeName}`
            : record.type === "characterData"
              ? "text"
              : `${record.addedNodes.length} added / ${record.removedNodes.length} removed`;
        const entry = `${record.type} on ${name}: ${what}`;
        if (!seen.includes(entry)) seen.push(entry);
      }
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    (window as unknown as { __seam: { seen: string[]; observer: MutationObserver } }).__seam = { seen, observer };
  });
}

/** Everything the observer saw, at most a handful of entries so a failure is
 *  readable rather than a wall of identical records. */
async function stopWatchingDocument(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const seam = (window as unknown as { __seam?: { seen: string[]; observer: MutationObserver } }).__seam;
    if (!seam) throw new Error("the document was never being watched");
    seam.observer.disconnect();
    return seam.seen.slice(0, 8);
  });
}

// ADVISORY-008 §5's seam audit, made mechanical: with a passage on screen,
// nothing in the periphery is animating a moment after it settles -- in
// both colour schemes, with reduced-motion both off and on. This is what
// makes ADR-019's amended seam ("material persists, events stop while a
// passage is on screen") checkable rather than asserted.
//
// An earlier version of this test read `backgroundPosition` and `transform`
// on the aura's `::before` only -- two properties this element's CSS never
// touches, sampled twice and compared. It could not fail: an independent
// review injected a continuous opacity-pulse onto the aura and this test
// still passed four-for-four. Fixed two ways, deliberately redundant with
// each other because they catch different failure modes: `animationName`
// is a direct claim about whether motion is *configured* at all -- it
// cannot be fooled by a two-sample check landing on a phase where a loop
// happens to look still, the way sampling can -- while `opacity`/`filter`,
// sampled twice 500ms apart, catch a style mutation that never touches a
// CSS animation in the first place (a rAF loop writing inline styles
// directly, which `animationName` can't see). Checked on both pseudo-
// elements, not only `::before`.
//
// That fix was then attacked again and found narrow in the same shape: a
// rAF loop writing an inline `transform` onto the aura's *parent* moved the
// aura 8px in half a second and passed all four cases, because every check
// above is scoped to a property and an element it names. Naming things is
// what made it evadable. So the checks below are ordered from named and
// specific to unnamed and general, and only the general ones decide:
//
//   1. the named properties, kept -- they fail fast and say plainly what
//      broke when the cause is the ordinary one (a CSS animation);
//   2. the animation timeline, which sees motion no stylesheet declares --
//      Element.animate(), a scripted transition -- anywhere in the aura's
//      subtree or ancestry;
//   3. the whole resolved appearance and geometry of the aura, its children,
//      and every ancestor up to <html>, each read together with both of its
//      pseudo-elements, sampled twelve times at intervals drawn fresh each
//      run;
//   4. the pixels themselves, photographs of a fixed patch of viewport
//      (below .reading-top, whose voice orb issue #99 licensed to turn --
//      see auraRegion), nothing masked within that patch, compared byte
//      for byte;
//   5. a MutationObserver watching the whole document for the entire window,
//      which is not a sampler at all and so has no gaps between looks.
//
// (3), (4) and (5) name no property and no element, which is the point: a
// mutation cannot be off a list that does not exist. (4) does not even ask
// how the pixels got there.
//
// WHAT THIS STILL DOES NOT CATCH, written down because a bound you have
// measured is worth more than a guarantee you have assumed:
//
//   * Motion installed by script *after* the window closes. The audit watches
//     for about two and a half seconds after the screen settles; a setTimeout
//     that starts a drift fifteen seconds into a reading session is not seen
//     by any layer here, and a verifier demonstrated exactly that. This is a
//     property of watching a window at all, not of these particular checks --
//     a longer window moves the threshold and never removes it. Note the
//     asymmetry that makes it narrower than it sounds: a *declarative* delay
//     (`animation-delay`, however long) is still caught, because layers 1 and
//     2 read configuration rather than movement, and see a CSS animation
//     during its delay phase. The gap is specifically script that has not run
//     yet, which is also the case a reviewer reading a diff can see plainly.
//   * Sub-gap transients that neither mutate the DOM nor persist between
//     samples. A 50ms blink once per 1.3s was, against an earlier fixed
//     schedule, missed in 10 of 12 case-runs. Layer (5) answers most of this
//     class outright -- a blink driven by DOM or inline style is reported the
//     instant it happens rather than sampled -- and the randomised gaps mean
//     anything hiding from (5) has to dodge a different schedule every run.
//     But (5) sees nodes, not paint: a verifier demonstrated a canvas
//     transient that mutates no node and rewrites no rule (visibly blinking,
//     evaded 8 of 12 runs), and shadow-DOM drift that only the photographs
//     caught. So state the residue as what it is, which is wider than any one
//     mechanism: if a change is brief enough to fall between two looks and
//     leaves no trace in the DOM or in resolved style, only (4) and (5) can
//     see it, and only probabilistically. Such a thing goes red eventually
//     rather than immediately. That is accepted, and accepted out loud --
//     a regression guard that reddens on the second or third run is still a
//     regression guard; one that quietly never reddens is not.
//
// What the audit costs, for whoever next lengthens the window: 14.7-15.4s per
// case against Playwright's 30s default. Roughly half of that is the two
// settle waits, most of the rest is the sampling window itself. There is room
// to grow, but not a lot -- past about 12s of extra watching, raise the
// timeout in the same commit rather than discovering it in CI.
//
// The seam cases opt out of the suite's retry, deliberately. Everywhere else
// in this file a retry papers over infrastructure variance under parallel
// load, which is the right trade for a test asking "did the app do the thing"
// -- but this test asks "did something move", and intermittent is what real
// motion looks like when it is rare. A retried pass would convert exactly the
// findings above into green.
test.describe(() => {
  test.describe.configure({ retries: 0 });
  for (const scheme of ["dark", "light"] as const) {
    for (const reducedMotion of [null, "reduce"] as const) {
      test(`seam holds while reading: ${scheme}, reduced-motion=${reducedMotion ?? "no-preference"}`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme: scheme, reducedMotion });
        await openProse(page);
        // Same parallel-worker contention window as the first test in this
        // file -- see its comment.
        await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });
        // Wait for the pull-up bar to reach its settled state before starting
        // to watch, the same way clickKeepReading does and for the same
        // reason. Its --visible flip is driven by an IntersectionObserver,
        // and this file already documents that headless Chromium under
        // parallel load can starve those callbacks for seconds. A fixed
        // settle alone would let a late-but-entirely-correct flip land inside
        // the watch window, where it is an attribute mutation on a settled
        // screen and a changed photograph -- a hard red on correct code,
        // since these cases do not retry. Waiting for the state rather than
        // for a duration makes a slow flip delay the audit instead of failing
        // it.
        await expect(page.locator(".passage-continue")).toHaveClass(/passage-continue--visible/, {
          timeout: 15_000,
        });
        // Then let every legitimate crossing animation (the passage arriving,
        // the bar's own transition to visible) finish settling.
        await page.waitForTimeout(1200);

        await expect(page.locator(".reading-screen-aura")).toBeAttached();

        // Starts before the first sample and runs to the last, so the gaps
        // between samples are watched too, not merely bracketed.
        await watchDocument(page);

        const t0 = await auraSnapshot(page);
        const region = await auraRegion(page);
        const pixels0 = await auraPixels(page, region);
        expect(t0.beforeAnimation).toBe("none");
        expect(t0.afterAnimation).toBe("none");
        expect(t0.running).toEqual([]);

        const gaps = sampleGaps();
        for (const [index, gap] of gaps.entries()) {
          await page.waitForTimeout(gap);
          const t = await auraSnapshot(page);
          const where = `sample ${index + 1} of ${gaps.length}, gaps ${gaps.join("/")}ms`;

          expect(t.beforeAnimation).toBe("none");
          expect(t.afterAnimation).toBe("none");
          expect(t.running).toEqual([]);
          expect(t.beforeOpacity).toBe(t0.beforeOpacity);
          expect(t.afterOpacity).toBe(t0.afterOpacity);
          expect(t.beforeFilter).toBe(t0.beforeFilter);
          expect(t.afterFilter).toBe(t0.afterFilter);

          // The general claim, and the one that decides. On failure this
          // prints exactly which element and which property moved, without the
          // test having had to guess either in advance.
          expect(drift(t0, t), `the aura's appearance changed by ${where}`).toEqual([]);

          // Photograph on every other sample -- enough to catch motion the
          // style tree can genuinely miss (a compositor-only animation, a
          // CSSOM-driven pseudo-element, an overlay drawn on top from
          // elsewhere in the document) without paying for a screenshot per
          // sample.
          if (index % 2 === 1) {
            const pixels = await auraPixels(page, region);
            expect(pixels.equals(pixels0), `the screen rendered differently at ${where}`).toBe(true);
          }
        }

        // Read last, so it covers the whole window rather than a prefix of
        // it: anything that moved between two looks above is reported here.
        expect(await stopWatchingDocument(page), "the document mutated while a passage sat on screen").toEqual([]);
      });
    }
  }
});

// PR-104 review, Finding 4: auraRegion's own comment (above) used to claim
// the row it excludes was "checked elsewhere" -- a grep of the suite found
// no such check. This is that check, written rather than merely promised:
// everything in `.reading-top` other than the orb (licensed to move by
// issue #99) must carry no running animation. `document.getAnimations()` is
// the seam test's own "layer 2" -- it sees a CSS animation or a scripted
// Element.animate() wherever one runs, and would see the orb too if its
// motion were ever reimplemented that way instead of the canvas loop it
// uses today (which this method cannot see at all, by construction --
// voice-orb-motion.spec.ts is what actually watches the orb itself).
test("nothing in the reading page's top row moves except the orb itself", async ({ page }) => {
  await openProse(page);
  await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(600);

  const runningOutsideOrb = await page.evaluate(() => {
    const row = document.querySelector(".reading-top");
    if (!row) return ["no .reading-top found"];
    return document
      .getAnimations()
      .filter((animation) => animation.playState === "running")
      .map((animation) => (animation.effect as KeyframeEffect | null)?.target)
      .filter(
        (target): target is Element =>
          !!target && row.contains(target) && !target.closest(".voice-orb-button"),
      )
      .map((target) => `${target.tagName}.${target.className}`);
  });
  expect(runningOutsideOrb, "something in the top row is animating besides the licensed orb").toEqual([]);
});
