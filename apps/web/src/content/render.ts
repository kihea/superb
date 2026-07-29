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

/** Composed passages carry {n} placeholders; fills say what goes in each. */
export function fillTemplate(text: string, fills: { index: number; word: string }[]): string {
  const byIndex = new Map(fills.map((f) => [f.index, f.word]));
  return text.replace(/\{(\d+)\}/g, (whole, n) => byIndex.get(Number(n)) ?? whole);
}
