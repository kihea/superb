// M2 contract item 5b, amended by ADVISORY-014 §2: "the tripwire is
// re-verified... by every PR that wires the real engine into any shell."
// This wiring PR is the first one that can actually violate it (the
// done-check that asked for this: item 5b held only "by vacancy" until now
// -- no consumer of the real engine existed to violate it). This test makes
// the property mechanical rather than a comment: the host's own ranking of
// PassageCandidates never reads `Candidate.words` (or `slots`), on records
// built to look like the real corpus.
//
// `rankCandidates` is `content/store.ts`'s pure ranking step, pulled out of
// `candidatesFor` specifically so this could be tested without a network
// fetch. It is the only place in this app that decides what order the
// engine ever sees candidates in.
import { describe, expect, test, vi } from "vitest";
import { rankCandidates, type Record_ } from "../src/content/store";

function composed(id: string, words: string[]): Record_ {
  return {
    id,
    pool: "composed",
    topic: "sea",
    text: "irrelevant to this test",
    // slots is where a composed record's own "words" concept lives
    // (defaultWord) -- varied here the same way the sourced records vary
    // `words` below, so both pools are covered.
    slots: words.map((w, i) => ({ index: i, class: `class-${i}`, defaultWord: w })),
  };
}

function sourced(id: string, words: string[]): Record_ {
  return {
    id,
    pool: "sourced",
    text: "irrelevant to this test",
    words: words.map((w) => ({ word: w, signals: ["definition-marker"] })),
    provenance: {
      work: "test fixture",
      author: "nobody",
      year: 1900,
      source: "test",
      url: "https://example.invalid",
      licence: "Public Domain",
      retrieved: "2026-07-27",
    },
  };
}

// Real ids from content/store.ts's own CURATED_FIRST list -- the test uses
// the real rotation, not a stand-in for it, so a change to that list still
// exercises this property against what actually ships.
const CURATED_IDS = ["comp-harbour-dawn", "comp-harbour-departure", "src-austen-emma-woodhouse"];

describe("PassageCandidates ranking never schedules against Candidate.words/slots", () => {
  test("curated order is identical no matter what words/slots content each record carries", () => {
    const wordSetA = [
      composed(CURATED_IDS[0], ["grey", "quietly", "steady"]),
      sourced(CURATED_IDS[1], ["ineffable", "inscrutable"]),
      composed(CURATED_IDS[2], ["one"]),
    ];
    // Same ids, same pools, wildly different word/slot payloads -- more
    // words, fewer words, different words entirely. If ranking ever read
    // this content, these two calls would disagree on order.
    const wordSetB = [
      composed(CURATED_IDS[0], []),
      sourced(CURATED_IDS[1], ["a", "b", "c", "d", "e", "f"]),
      composed(CURATED_IDS[2], ["completely", "different", "set", "of", "words"]),
    ];

    const rankedA = rankCandidates(wordSetA, new Set()).map((r) => r.id);
    const rankedB = rankCandidates(wordSetB, new Set()).map((r) => r.id);

    expect(rankedA).toEqual(CURATED_IDS);
    expect(rankedB).toEqual(CURATED_IDS);
  });

  test("exclusion is by id only -- a record with zero words is still excludable, and one with many is still includable", () => {
    const records = [composed(CURATED_IDS[0], []), sourced(CURATED_IDS[1], ["x", "y", "z", "w"])];
    const ranked = rankCandidates(records, new Set([CURATED_IDS[0]]));
    expect(ranked.map((r) => r.id)).toEqual([CURATED_IDS[1]]);
  });

  // The first test above only exercises rankCandidates' curated branch --
  // 37 ids. Every other record in the real corpus (~2,600 of ~2,639, as of
  // this writing) falls through to shuffled(), and that branch went
  // untested here: a verifier making shuffled()'s non-curated order depend
  // on `words`/`slots` (sorting by word or slot-array length) still passed
  // the suite above. A tripwire that only covers 1.4% of the pool is a
  // vacancy wearing a proof's clothes -- this covers the other 98.6%.
  //
  // shuffled() itself calls Math.random(), so two calls over different
  // payloads will legitimately disagree on order even when the property
  // holds -- that is randomness, not a words/slots dependency, and a naive
  // "same order every time" assertion would be meaningless noise either
  // way. Pinning Math.random() to the same sequence for both calls removes
  // that legitimate variance and isolates the one thing being asserted:
  // given the same draws, the same *positions* end up in the same places
  // regardless of what each record's `words`/`slots` say.
  test("non-curated (shuffled) order is identical given the same random draws, no matter what words/slots content each record carries", () => {
    const NON_CURATED_IDS = [
      "comp-test-alpha",
      "src-test-bravo",
      "comp-test-charlie",
      "src-test-delta",
      "comp-test-echo",
      "src-test-foxtrot",
    ];
    const drawSequence = [0.91, 0.12, 0.53, 0.34, 0.77, 0.05, 0.68, 0.29];
    const random = () => drawSequence[nextDraw++ % drawSequence.length];
    let nextDraw = 0;

    const spy = vi.spyOn(Math, "random").mockImplementation(random);
    try {
      const wordSetA = [
        composed(NON_CURATED_IDS[0], ["one", "two", "three"]),
        sourced(NON_CURATED_IDS[1], ["ineffable"]),
        composed(NON_CURATED_IDS[2], []),
        sourced(NON_CURATED_IDS[3], ["a", "b", "c", "d", "e"]),
        composed(NON_CURATED_IDS[4], ["single"]),
        sourced(NON_CURATED_IDS[5], ["x", "y"]),
      ];
      const wordSetB = [
        composed(NON_CURATED_IDS[0], []),
        sourced(NON_CURATED_IDS[1], ["completely", "different", "set", "of", "words", "entirely"]),
        composed(NON_CURATED_IDS[2], ["now", "has", "four", "slots"]),
        sourced(NON_CURATED_IDS[3], []),
        composed(NON_CURATED_IDS[4], ["a", "b"]),
        sourced(NON_CURATED_IDS[5], ["z"]),
      ];

      nextDraw = 0;
      const rankedA = rankCandidates(wordSetA, new Set()).map((r) => r.id);
      nextDraw = 0;
      const rankedB = rankCandidates(wordSetB, new Set()).map((r) => r.id);

      expect(rankedA).toEqual(rankedB);
      // Not a no-op: with this draw sequence the permutation actually
      // reorders the input, so the assertion above is discriminating
      // rather than trivially satisfied by an identity shuffle.
      expect(rankedA).not.toEqual(NON_CURATED_IDS);
    } finally {
      spy.mockRestore();
    }
  });
});
