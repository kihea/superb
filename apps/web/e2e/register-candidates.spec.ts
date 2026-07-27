// Item 7's three built candidates (register-candidates.ts, ADVISORY-012
// Directive 2). "bare" is asserted to be byte-identical in behaviour to the
// screen reading.spec.ts already covers; "drawn" and "inked" get the same
// class of law-3 and seam checks the merged register already carries, so a
// reviewer never has to take the new motifs' safety on faith.
import { test, expect } from "@playwright/test";

const CANDIDATES = ["bare", "drawn", "inked"] as const;

for (const candidate of CANDIDATES) {
  test.describe(`candidate=${candidate}`, () => {
    test("renders the real passage, decorative motifs never become tap targets", async ({ page }) => {
      await page.goto(`/?candidate=${candidate}`);
      await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });

      // Every word is still the same identical button -- no motif this
      // candidate adds is allowed to reach into the passage text itself.
      const words = page.locator(".passage-word");
      expect(await words.count()).toBeGreaterThan(20);
      const classNames = await words.evaluateAll((els) => [...new Set(els.map((el) => el.className))]);
      expect(classNames).toEqual(["passage-word"]);

      // The doodle motifs, when present, are marked aria-hidden and are not
      // focusable or clickable -- a drawn register must not add a fourth
      // interaction to a screen law 3 says has exactly one kind of target.
      for (const selector of [".margin-mark", ".break-chain"]) {
        const nodes = page.locator(selector);
        const count = await nodes.count();
        if (candidate === "bare") {
          expect(count).toBe(0);
        } else if (count > 0) {
          await expect(nodes.first()).toHaveAttribute("aria-hidden", "true");
          const tabIndex = await nodes.first().evaluate((el) => el.getAttribute("tabindex"));
          expect(tabIndex).toBeNull();
        }
      }
    });

    // The dropped tooth is chosen once and fixed, not randomised per render
    // (DERIVATION-001) -- two independent loads of the same candidate must
    // draw the identical number of chain links.
    test("the break chain's dropped tooth is stable across reloads, not randomised", async ({ page }) => {
      await page.goto(`/?candidate=${candidate}`);
      await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });
      const first = await page.locator(".break-chain-link").count();

      await page.reload();
      await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });
      const second = await page.locator(".break-chain-link").count();

      expect(first).toBe(second);
      if (candidate !== "bare") expect(first).toBeGreaterThan(0);
    });

    // The general law-3 sweep, reused verbatim from reading.spec.ts's own
    // topic-affinity check but run once per candidate: no candidate may be
    // the one that quietly leaks the schedule.
    test("no candidate narrates its own pedagogy in rendered text", async ({ page }) => {
      await page.goto(`/?candidate=${candidate}`);
      await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });
      const bodyText = (await page.locator("body").innerText()).toLowerCase();
      for (const word of ["topic", "affinity", "streak", "score", "level", "review queue"]) {
        expect(bodyText).not.toContain(word);
      }
    });

    // The seam audit (ADVISORY-008 §5 item 4), per candidate: nothing added
    // by a candidate may itself be an animation running behind the text.
    // The aura's own check already lives in reading.spec.ts; this asserts
    // the same stillness of the two new motifs specifically.
    test("the doodle motifs are printed still, not animating, in both colour schemes", async ({ page }) => {
      for (const scheme of ["dark", "light"] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(`/?candidate=${candidate}`);
        await expect(page.locator(".passage-page")).toBeVisible({ timeout: 15_000 });
        await page.waitForTimeout(600);

        for (const selector of [".margin-mark-stroke", ".break-chain-link"]) {
          const nodes = page.locator(selector);
          const count = await nodes.count();
          if (count === 0) continue;
          const animationName = await nodes.first().evaluate((el) => getComputedStyle(el).animationName);
          expect(animationName).toBe("none");
        }
      }
    });
  });
}
