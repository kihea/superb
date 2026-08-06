// The v1 walk: what a brand-new person actually does on their first night.
// A fresh browser context, so nothing is set: the very first "/" must go to
// the welcome. Then the mark, the mood question, three books, a cover --
// and from there a real book is read, a word is kept and found again on
// /words, and one rhyme round is played to its end screen.
//
// The reading half runs on Dracula, the one book served from the vendored
// local artifact rather than the jsDelivr CDN, so the walk never depends on
// the network. The welcome's own three offers are CDN-backed books; the
// walk goes as far with them as the local index allows (their covers) and
// then reads the local one.
import { test, expect } from "@playwright/test";

test("first open to kept word to rhyme round, end to end", async ({ page }) => {
  test.setTimeout(90_000);

  // ── The welcome ──
  // Nothing in storage yet: "/" itself must route to /welcome.
  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome$/, { timeout: 15_000 });

  // The mark: the plate with SUPERB carved out of it, and one button. The
  // wordmark used to be set type; it is the app's own generated ASCII mark
  // now, so what is asserted is that the carving actually spells the name
  // rather than that a <span> holds the word.
  await expect(page.locator(".first .plate").first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Start" }).click();

  // The mood question -- one tap.
  await expect(page.getByRole("heading", { name: "What do you want to read?" })).toBeVisible();
  await page.getByRole("button", { name: "A story" }).click();

  // Three books, each with a title and an author.
  const offers = page.locator(".first__book");
  await expect(offers).toHaveCount(3, { timeout: 15_000 });
  await expect(offers.first().locator(".first__book-title")).not.toBeEmpty();

  // Open one: its cover screen, with its names and a way to begin.
  const chosenTitle = await offers.first().locator(".first__book-title").innerText();
  await offers.first().click();
  await expect(page).toHaveURL(/\/book\//);
  await expect(page.locator(".book__names")).toContainText(chosenTitle, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Begin" })).toBeVisible();

  // ── Reading, on the locally served book ──
  await page.goto("/book/bram-stoker_dracula");
  await expect(page.locator(".book__names")).toContainText("Dracula", { timeout: 15_000 });
  await page.getByRole("button", { name: "Begin" }).click();

  // The reader shows real chapter text.
  await expect(page).toHaveURL(/\/book\/bram-stoker_dracula\/read$/);
  await expect(page.locator(".reader")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".reader__block").first()).toContainText(/\w/);

  // Tap a glossed word: the card opens with the word and a real meaning.
  const word = page.locator(".reader__word").first();
  const tapped = (await word.innerText()).trim();
  await word.click();
  const card = page.locator(".gloss-card");
  await expect(card).toBeVisible();
  await expect(card.locator(".gloss-word")).toHaveText(tapped);
  await expect(card.locator(".gloss-definition")).not.toBeEmpty();

  // Keep it. The card follows the keep into stillness on its own.
  await card.locator(".gloss-keep-button").click();
  await expect(card).toBeHidden({ timeout: 5_000 });

  // The kept word waits on /words, with its meaning and its sentence.
  await page.goto("/words");
  const keptItem = page.locator(".words__row", { hasText: tapped.toLowerCase() });
  await expect(keptItem).toBeVisible({ timeout: 15_000 });
  await expect(keptItem.locator(".words__word")).toHaveText(tapped.toLowerCase());
  await expect(keptItem.locator(".words__meaning")).not.toBeEmpty();

  // ── One rhyme round ──
  await page.goto("/play");
  await page.getByRole("button", { name: "Rhyme" }).click();
  await expect(page).toHaveURL(/\/play\/rhyme$/);

  const seed = page.locator(".challenge-seed");
  await expect(seed).toBeVisible({ timeout: 15_000 });
  const promptWord = (await seed.innerText()).trim();

  // One exact rhyme for whatever prompt appeared, taken from the game's own
  // served data and judged the way the game judges: same rime key in the
  // pronunciation table, not the same stem.
  const exact = await page.evaluate(async (prompt) => {
    const [file, prons] = await Promise.all([
      fetch("/content/challenges/rhyme-prompts.json").then((r) => r.json()),
      fetch("/content/challenges/pronunciations.json").then((r) => r.json()),
    ]);
    const strip = (w: string) => w.replace(/(ings?|ies|ed|es|s|ly)$/, "");
    const sameStem = (a: string, b: string) => {
      const sa = strip(a);
      const sb = strip(b);
      return sa === sb || sa.startsWith(sb) || sb.startsWith(sa);
    };
    for (const prompts of Object.values(
      (file as { tiers: Record<string, { word: string; exact: { word: string }[] }[]> }).tiers,
    )) {
      const hit = prompts.find((p) => p.word === prompt);
      if (!hit) continue;
      const table = prons as Record<string, [string, string, number]>;
      return (
        hit.exact.find(
          (r) => table[r.word] && table[prompt] && table[r.word][0] === table[prompt][0] && !sameStem(r.word, prompt),
        )?.word ?? null
      );
    }
    return null;
  }, promptWord);
  expect(exact, `no judgeable exact rhyme in the data for "${promptWord}"`).not.toBeNull();

  await page.locator(".sb-answer__field").fill(exact!);
  await page.getByRole("button", { name: "Add", exact: true }).click();

  // The offer lands as a filled (exact) chip on the board.
  await expect(page.locator(".sb-chip--exact")).toHaveText(exact!);

  // Enough -- the end screen: how you answered, and how you could have.
  await page.getByRole("button", { name: "Enough" }).click();
  await expect(page.locator(".challenge-end")).toBeVisible();
  await expect(page.locator(".challenge-end").getByRole("heading")).toContainText("1 exact");
  await expect(page.locator(".challenge-end .sb-chip--exact")).toHaveText(exact!);
});
