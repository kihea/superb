// Turns a passage's raw text into tappable tokens. Every word is a tap
// target, with no visual distinction between one and the next -- law 3:
// target words are never marked, and the only honest way to guarantee that
// is to make every word behave identically (craft skill: differential
// behaviour is itself a mark, even a silent one).
export interface WordToken {
  type: "word";
  text: string;
  position: number;
}
export interface SeparatorToken {
  type: "sep";
  text: string;
}
export type PassageToken = WordToken | SeparatorToken;

const WORD_PATTERN = /[A-Za-z]+(?:['\u2019-][A-Za-z]+)*/g;

export function tokenize(text: string): PassageToken[] {
  const tokens: PassageToken[] = [];
  let cursor = 0;
  let position = 0;
  for (const match of text.matchAll(WORD_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) tokens.push({ type: "sep", text: text.slice(cursor, start) });
    tokens.push({ type: "word", text: match[0], position: position++ });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) tokens.push({ type: "sep", text: text.slice(cursor) });
  return tokens;
}

// Words that end in a full stop without ending a sentence. Short and
// deliberately incomplete: the alternative is a sentence splitter, and the
// cost of getting one of these wrong is that a held sentence is a little
// long, not that anything breaks.
const ABBREVIATIONS = new Set(["mr", "mrs", "ms", "dr", "st", "prof", "vs", "etc"]);

/** The tokens grouped into sentences, so a reader can hold one (frame 1v:
 *  share appears only when you hold a sentence). Every token lands in
 *  exactly one group and the groups concatenate back to the original text,
 *  which is the property the test checks -- a sentence that quietly ate a
 *  comma would be a passage the reader cannot trust. */
export function groupIntoSentences(tokens: PassageToken[]): PassageToken[][] {
  const sentences: PassageToken[][] = [];
  let current: PassageToken[] = [];
  let lastWord = "";

  for (const token of tokens) {
    current.push(token);
    if (token.type === "word") {
      lastWord = token.text.toLowerCase();
      continue;
    }
    // A terminator, any closing quotes or brackets after it, then space.
    const ends = /[.!?][")'”’\]]*\s/.test(token.text) || /[.!?][")'”’\]]*$/.test(token.text);
    if (ends && !ABBREVIATIONS.has(lastWord)) {
      sentences.push(current);
      current = [];
    }
  }

  if (current.length > 0) sentences.push(current);
  return sentences;
}

/** Composed passages carry {n} placeholders; fills say what goes in each. */
export function fillTemplate(text: string, fills: { index: number; word: string }[]): string {
  const byIndex = new Map(fills.map((f) => [f.index, f.word]));
  return text.replace(/\{(\d+)\}/g, (whole, n) => byIndex.get(Number(n)) ?? whole);
}
