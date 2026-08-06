// The reader's navigation, added after the spine: the title block opens the
// book's own contents page, the tick strip scrubs through the chapter, and a
// sideways swipe turns the page. Dracula again, for the same reason as the
// spine: it is served from the vendored local artifact, so this never leaves
// localhost.
import { test, expect, type Page } from "@playwright/test";

async function openDracula(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("superb.welcomed", "1");
  });
  await page.goto("/book/bram-stoker_dracula/read");
  await expect(page.locator(".reader")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".reader__word").first()).toBeVisible({ timeout: 15_000 });
}

test("the title block opens the contents, and the contents move the book", async ({ page }) => {
  await openDracula(page);
  await expect(page.locator(".reader")).toHaveAttribute("data-part-index", "0");

  // The way in: the book's own title, not a separate control.
  await page.locator(".reader__where").click();
  const rows = page.locator(".reader__contents-row");
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(3);

  // The chapter being read carries the bookmark.
  await expect(page.locator(".reader__contents-row--here")).toHaveCount(1);
  await expect(page.locator(".reader__contents-row--here .reader__contents-mark")).toBeVisible();

  // Choosing a chapter goes there, and the sheet gets out of the way.
  await rows.nth(2).click();
  await expect(page.locator(".reader")).toHaveAttribute("data-part-index", "2");
  await expect(page.locator(".reader__contents")).toHaveCount(0);

  // Reopening shows the bookmark moved with the reader.
  await page.locator(".reader__where").click();
  await expect(page.locator(".reader__contents-row--here")).toHaveCount(1);
  await expect(rows.nth(2)).toHaveClass(/reader__contents-row--here/);
});

test("the tick strip scrubs to a page", async ({ page }) => {
  await openDracula(page);
  await expect(page.locator(".reader__count")).toHaveText(/^1 \/ \d+$/);

  const strip = page.locator(".reader__ticks");
  const box = await strip.boundingBox();
  if (!box) throw new Error("the tick strip has no box");

  // A tap most of the way along the strip lands most of the way through
  // the chapter.
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
  const count = await page.locator(".reader__count").innerText();
  const [now, total] = count.split("/").map((s) => Number(s.trim()));
  expect(total).toBeGreaterThan(1);
  expect(now).toBeGreaterThan(total * 0.7);

  // Dragging back along the strip riffles back toward the front.
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  const after = await page.locator(".reader__count").innerText();
  const [landed] = after.split("/").map((s) => Number(s.trim()));
  expect(landed).toBeLessThan(now);
});

test("a sideways swipe turns the page", async ({ page }) => {
  await openDracula(page);
  const viewport = page.locator(".reader__viewport");
  const box = await viewport.boundingBox();
  if (!box) throw new Error("the viewport has no box");
  const midY = box.y + box.height / 2;

  // Forward: a swipe leftward, the way a page turns.
  await page.mouse.move(box.x + box.width * 0.8, midY);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, midY, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator(".reader__count")).toHaveText(/^2 \/ \d+$/);

  // Back again, rightward.
  await page.mouse.move(box.x + box.width * 0.2, midY);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, midY, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator(".reader__count")).toHaveText(/^1 \/ \d+$/);
});
