// The sense picker: given a word with several tagged senses and the
// sentence it was tapped in, the card should show the sense the sentence
// actually uses — and fall back to the default when nothing helps.
import { describe, expect, it } from "vitest";
import { pickDefinition, inferPos } from "../src/content/senses";
import type { BookGlossEntry } from "../src/content/glosses";

const SOUND: BookGlossEntry = {
  definition: "A sensation perceived by the ear caused by the vibration of air.",
  senses: [
    { pos: "noun", def: "A sensation perceived by the ear caused by the vibration of air." },
    { pos: "verb", def: "To produce a sound." },
    { pos: "adj", def: "Healthy." },
    { pos: "noun", def: "A long narrow inlet, or a strait between the mainland and an island." },
  ],
};

describe("inferPos", () => {
  it("reads a determiner whose phrase closes right after as a noun signal", () => {
    expect(inferPos("sound", "They heard a sound in the dark.")).toBe("noun");
  });

  it("reads a determiner-led word followed by more phrase as an adjective", () => {
    // The Drood case: "an ancient English Cathedral" does not make
    // ancient a noun — the determiner starts the phrase, ancient dresses it.
    expect(inferPos("ancient", "an ancient English Cathedral town")).toBe("adj");
  });

  it("reads 'to' and -ed forms as verb signals", () => {
    expect(inferPos("sound", "He wanted to sound the alarm.")).toBe("verb");
    expect(inferPos("sounded", "The bell sounded twice.")).toBe("verb");
  });

  it("reads intensifiers as adjective signals", () => {
    expect(inferPos("sound", "The advice was very sound indeed.")).toBe("adj");
  });
});

describe("capital senses", () => {
  const ENGLISH: BookGlossEntry = {
    definition: "Spinning or rotary motion given to a ball around the vertical axis.",
    senses: [
      { pos: "noun", def: "Spinning or rotary motion given to a ball around the vertical axis." },
      { pos: "noun", def: "The language of England, spoken widely around the world.", cap: true },
      { pos: "adj", def: "Of or pertaining to England or its people.", cap: true },
    ],
  };

  it("a mid-sentence capital picks the capital senses over the billiards spin", () => {
    const picked = pickDefinition("English", ENGLISH, "an ancient English Cathedral town");
    expect(picked).not.toBe(ENGLISH.definition);
    expect(picked).toMatch(/England/);
  });

  it("a lowercase tap keeps the lowercase sense", () => {
    expect(pickDefinition("english", ENGLISH, "he put some english on the cue ball")).toBe(
      ENGLISH.definition,
    );
  });
});

describe("pickDefinition", () => {
  it("keeps the default when there is no context", () => {
    expect(pickDefinition("sound", SOUND)).toBe(SOUND.definition);
  });

  it("picks the adjective sense in an adjective sentence", () => {
    expect(pickDefinition("sound", SOUND, "Her judgment was very sound.")).toBe("Healthy.");
  });

  it("picks the verb sense in a verb sentence", () => {
    expect(pickDefinition("sound", SOUND, "He rose to sound the depths.")).toBe(
      "To produce a sound.",
    );
  });

  it("lets sentence-word overlap choose between same-POS senses", () => {
    expect(
      pickDefinition("sound", SOUND, "The boat crossed the sound between the island and the shore."),
    ).toBe("A long narrow inlet, or a strait between the mainland and an island.");
  });

  it("reads senses from the shared table when the entry has none", () => {
    const entry: BookGlossEntry = { definition: "A sensation perceived by the ear." };
    const shared = { sound: SOUND.senses! };
    expect(pickDefinition("sound", entry, "The advice was very sound.", shared)).toBe("Healthy.");
  });
});
