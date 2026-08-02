// ADR-029 -- the word-to-difficulty mapping, at the seam where the shell
// answers the engine's [bandLow, bandHigh] window.
//
// Two things are being held. First, that the band is a real filter and a
// real ordering: before this, `bandWords` was the whole lexicon flattened in
// class-id order, so a brand-new reader's first words were chosen by where a
// filename sorts. Second, that answering it does not disturb the M2
// contract's item 5b tripwire -- nothing schedules against a candidate
// record's `words` on the real corpus. `bandWordsFor` is a pure function
// taking the lexicon and the table as arguments precisely so both can be
// asserted without a network fetch, and so a verifier can see at the
// signature that a candidate record is not among its inputs.
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { bandWordsFor } from "../src/content/store";

// The real, shipped table -- not a fixture. A test that invents its own
// difficulties would prove the sort works and nothing about what readers get.
const difficultyPath = fileURLToPath(new URL("../../../content/difficulty.json", import.meta.url));
const table: Record<string, number> = JSON.parse(readFileSync(difficultyPath, "utf-8")).words;
const allWords = Object.keys(table);

// tuning.toml's band offsets. A fresh reader is at θ = 0 (superb-wasm's own
// constructor), so [-0.2, +0.6] is literally the first window this app ever
// opens on its vocabulary.
const BAND_LOW = -0.2;
const BAND_HIGH = 0.6;
const SEED_SLOTS_PER_PASSAGE = 2;

describe("band words are filtered and ordered by difficulty", () => {
  test("every returned word sits inside the requested window", () => {
    for (const [low, high] of [
      [BAND_LOW, BAND_HIGH],
      [1.0 + BAND_LOW, 1.0 + BAND_HIGH],
      [2.0 + BAND_LOW, 2.0 + BAND_HIGH],
    ]) {
      const band = bandWordsFor(allWords, table, low, high);
      expect(band.length).toBeGreaterThan(0);
      for (const word of band) {
        expect(table[word]).toBeGreaterThanOrEqual(low);
        expect(table[word]).toBeLessThanOrEqual(high);
      }
    }
  });

  test("the window actually excludes -- it is not the whole lexicon in disguise", () => {
    const band = bandWordsFor(allWords, table, BAND_LOW, BAND_HIGH);
    expect(band.length).toBeLessThan(allWords.length);
    // The specific failure this replaces: the old stand-in returned every
    // word, so a fresh reader was offered words two logits above their band.
    const outside = allWords.filter((w) => table[w] > BAND_HIGH);
    expect(outside.length).toBeGreaterThan(0);
    for (const word of outside) expect(band).not.toContain(word);
  });

  test("easiest useful word first, ties broken by the word itself", () => {
    const band = bandWordsFor(allWords, table, 1.0 + BAND_LOW, 1.0 + BAND_HIGH);
    for (let i = 1; i < band.length; i++) {
      const previous = table[band[i - 1]];
      const current = table[band[i]];
      expect(previous).toBeLessThanOrEqual(current);
      if (previous === current) expect(band[i - 1] < band[i]).toBe(true);
    }
  });

  test("the ordering is total -- the same inputs in any order give the same answer", () => {
    const forwards = bandWordsFor(allWords, table, BAND_LOW, BAND_HIGH);
    const backwards = bandWordsFor([...allWords].reverse(), table, BAND_LOW, BAND_HIGH);
    expect(backwards).toEqual(forwards);
  });

  test("a fresh reader has enough band words to fill the passage's reserved seed slots", () => {
    const band = bandWordsFor(allWords, table, BAND_LOW, BAND_HIGH);
    expect(band.length).toBeGreaterThanOrEqual(SEED_SLOTS_PER_PASSAGE);
  });

  test("a word with no difficulty row is left out rather than guessed at", () => {
    const band = bandWordsFor([...allWords, "wordnotinthetable"], table, BAND_LOW, BAND_HIGH);
    expect(band).not.toContain("wordnotinthetable");
  });

  test("an empty band is legal -- above the hardest authored word the app has nothing left to teach", () => {
    const hardest = Math.max(...Object.values(table));
    expect(bandWordsFor(allWords, table, hardest + 1, hardest + 2)).toEqual([]);
  });
});

describe("the corpus's own words can enter the band", () => {
  // The reverse of the tripwire this test used to hold. For a long time the
  // difficulty table only knew the slot lexicon, so the corpus's three and a
  // half thousand target words could never be met for the first time. The
  // table now covers them by design, and candidatesFor's population includes
  // them -- so a corpus word inside the window belongs in the answer.
  test("a corpus target word with a difficulty row inside the window is served", () => {
    const corpusClaims = ["ineffable", "inscrutable", "shook", "diamonds"];
    const known = corpusClaims.filter((word) => table[word] !== undefined);
    expect(known.length).toBeGreaterThan(0);
    const hardest = Math.max(...Object.values(table));
    const softest = Math.min(...Object.values(table));
    const band = bandWordsFor([...allWords, ...corpusClaims], table, softest, hardest);
    for (const word of known) expect(band).toContain(word);
  });

  test("offering the same word twice serves it once", () => {
    const band = bandWordsFor([...allWords, "shook", "shook"], table, BAND_LOW, BAND_HIGH);
    const counts = band.filter((word) => word === "shook").length;
    expect(counts).toBeLessThanOrEqual(1);
  });
});
