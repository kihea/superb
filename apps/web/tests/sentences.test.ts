// Grouping a passage into sentences is what makes "hold a sentence"
// (frame 1v) possible, and the one property that must never break is that
// the grouping is lossless: the sentences put back together are the
// passage, character for character. A splitter that swallows a comma is a
// passage the reader cannot trust.
import { describe, expect, test } from "vitest";
import { groupIntoSentences, tokenize } from "../src/content/render";

function rejoin(text: string): string {
  return groupIntoSentences(tokenize(text))
    .flat()
    .map((token) => token.text)
    .join("");
}

function shapes(text: string): string[] {
  return groupIntoSentences(tokenize(text)).map((sentence) =>
    sentence
      .map((token) => token.text)
      .join("")
      .trim(),
  );
}

describe("groupIntoSentences", () => {
  test("is lossless for every passage shape we render", () => {
    for (const text of [
      "One. Two. Three.",
      "He said “stop.” She did not.",
      "Ends without a stop",
      "  leading space, and a trailing one.  ",
      "Dashes—em ones—and semicolons; all of it.",
      "",
    ]) {
      expect(rejoin(text)).toBe(text);
    }
  });

  test("splits on sentence ends", () => {
    expect(shapes("One thing. Then another! And a third?")).toEqual([
      "One thing.",
      "Then another!",
      "And a third?",
    ]);
  });

  test("keeps a closing quote with the sentence it closes", () => {
    expect(shapes('He said "stop." She did not.')).toEqual(['He said "stop."', "She did not."]);
  });

  test("does not split on an abbreviation's full stop", () => {
    expect(shapes("Mr. Utterson was a lawyer. He rarely smiled.")).toEqual([
      "Mr. Utterson was a lawyer.",
      "He rarely smiled.",
    ]);
  });

  test("a passage with no terminator at all is one sentence", () => {
    expect(shapes("no stop here")).toEqual(["no stop here"]);
  });

  test("empty text produces no sentences, rather than one empty one", () => {
    expect(groupIntoSentences(tokenize(""))).toEqual([]);
  });
});
