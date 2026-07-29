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

describe("the band-word path does not schedule against a candidate record", () => {
  // Item 5b's tripwire, held at the new consumer rather than only at
  // rankCandidates (tests/candidates-ranking.test.ts holds that one). The
  // guarantee here is structural and is worth stating as an assertion rather
  // than as a comment: bandWordsFor's inputs are the slot lexicon and the
  // difficulty table. Neither carries a sourced excerpt's `words`, so no
  // corpus claim can reach a scheduling decision through this path.
  test("the answer depends only on the lexicon and the table, so no corpus content can reach it", () => {
    // Every word the real corpus claims to teach, offered as a population.
    // If the band ever consulted a record, these would have to appear.
    const corpusClaims = ["ineffable", "inscrutable", "shook", "diamonds"];
    const withCorpusWords = bandWordsFor([...allWords, ...corpusClaims], table, BAND_LOW, BAND_HIGH);
    const withoutCorpusWords = bandWordsFor(allWords, table, BAND_LOW, BAND_HIGH);
    // A corpus word only ever enters if the *table* knows it, and the table
    // is keyed on the slot lexicon -- not on any excerpt's claims.
    expect(withCorpusWords).toEqual(withoutCorpusWords);
  });
});
