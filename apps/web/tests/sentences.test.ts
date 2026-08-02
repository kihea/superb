// Grouping a passage into sentences is what makes "hold a sentence"
// (frame 1v) possible, and the one property that must never break is that
// the grouping is lossless: the sentences put back together are the
// passage, character for character. A splitter that swallows a comma is a
// passage the reader cannot trust.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { groupIntoSentences, tokenize } from "../src/content/render";

const here = dirname(fileURLToPath(import.meta.url));
const contentRoot = join(here, "..", "..", "..", "content");

// The passage the app actually opens on, with its slots filled -- the exact
// string a reader sees at `/`. It is here because the first version of this
// file tested six hand-written fixtures and not one of them contained the
// word "the": a sabotage that dropped every "the" from the splitter left
// all six green, including the case titled "every passage shape we render".
// A test named after the text we render has to contain the text we render.
const APP_OPENING_PASSAGE =
  "The grey light came up over the water, and the boats lay quietly at their moorings, each one steady against the pull of the tide. Down on the quay, an old man in a coat gone weathered with years was already sorting nets, his hands moving with a patience the morning did not ask of him. A gull cried once, and then again, and the sound carried faintly across the harbour before it was lost among the masts. Further out, past the breakwater, the sea kept its own hours, indifferent to the little town waking behind him. He had watched this water for longer than he cared to say, and still it gave him nothing he could name — only this, the peaceful hour before the boats went out, when the whole harbour seemed to hold its breath. By the time the sun cleared the headland, the hush of the morning would be gone, replaced by voices and rope and the ordinary business of the day. For now, though, it was his alone.";

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
  test("is lossless on the punctuation shapes", () => {
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

  test("is lossless on the passage the app opens with", () => {
    expect(rejoin(APP_OPENING_PASSAGE)).toBe(APP_OPENING_PASSAGE);
  });

  test("is lossless on every block of real book text we render", () => {
    // The vendored catalogue artifact: the same Dracula the reading room
    // serves locally, every block of it, not a hand-picked excerpt.
    const lock = JSON.parse(readFileSync(join(contentRoot, "catalogue.lock.json"), "utf-8"));
    const artifact = JSON.parse(
      readFileSync(join(contentRoot, lock.vendored_path.replace(/^content\//, "")), "utf-8"),
    );
    const dracula = artifact.books.find((b: { id: string }) => b.id === "bram-stoker_dracula");
    const blocks: string[] = dracula.parts.flatMap((part: { blocks: { text: string }[] }) =>
      part.blocks.map((block) => block.text),
    );
    expect(blocks.length).toBeGreaterThan(5);
    for (const block of blocks) {
      expect(rejoin(block)).toBe(block);
    }
  });

  test("the app's opening passage splits into the sentences it is written in", () => {
    const sentences = groupIntoSentences(tokenize(APP_OPENING_PASSAGE));
    expect(sentences).toHaveLength(7);
    expect(sentences[0].map((t) => t.text).join("").trim()).toBe(
      "The grey light came up over the water, and the boats lay quietly at their moorings, each one steady against the pull of the tide.",
    );
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
