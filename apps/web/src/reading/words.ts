// Kept words -- the reader's own collection. A word is kept from the word
// card while reading, or from a game's end-of-round reveal. Keeping never
// explains itself: no toast, no counter. The word just goes quiet and waits
// on the Words screen.
import { loadKeptSentences, loadKeptWords, saveKeptSentences, saveKeptWords } from "../storage/db";

export interface KeptWord {
  word: string;
  definition: string;
  /** Where it was kept from: a book id, or "rhyme" / "association" /
   *  "prose" for the games. */
  source: string;
  /** The sentence it was met in, when there was one. */
  context?: string;
  keptAt: number;
}

function isKeptWord(value: unknown): value is KeptWord {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<KeptWord>;
  return (
    typeof v.word === "string" &&
    typeof v.definition === "string" &&
    typeof v.source === "string" &&
    typeof v.keptAt === "number"
  );
}

export async function getKeptWords(): Promise<KeptWord[]> {
  const raw = await loadKeptWords<unknown>();
  return raw.filter(isKeptWord);
}

/** Keeps a word. Keeping the same word again refreshes its entry rather
 *  than duplicating it. */
export async function keepWord(entry: Omit<KeptWord, "keptAt">, now: number): Promise<KeptWord[]> {
  const words = await getKeptWords();
  const kept: KeptWord = { ...entry, word: entry.word.toLowerCase(), keptAt: now };
  const next = [...words.filter((w) => w.word !== kept.word), kept];
  await saveKeptWords(next);
  return next;
}

export async function unkeepWord(word: string): Promise<KeptWord[]> {
  const words = await getKeptWords();
  const next = words.filter((w) => w.word !== word.toLowerCase());
  await saveKeptWords(next);
  return next;
}

export async function isKept(word: string): Promise<boolean> {
  const words = await getKeptWords();
  return words.some((w) => w.word === word.toLowerCase());
}

// ── Kept sentences -- held from the page and kept whole. ──

export interface KeptSentence {
  text: string;
  /** A book id, or "prose" for a composed passage. */
  source: string;
  keptAt: number;
}

function isKeptSentence(value: unknown): value is KeptSentence {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<KeptSentence>;
  return typeof v.text === "string" && typeof v.source === "string" && typeof v.keptAt === "number";
}

export async function getKeptSentences(): Promise<KeptSentence[]> {
  const raw = await loadKeptSentences<unknown>();
  return raw.filter(isKeptSentence);
}

export async function keepSentence(text: string, source: string, now: number): Promise<KeptSentence[]> {
  const sentences = await getKeptSentences();
  const trimmed = text.trim();
  const next = [...sentences.filter((s) => s.text !== trimmed), { text: trimmed, source, keptAt: now }];
  await saveKeptSentences(next);
  return next;
}

export async function unkeepSentence(text: string): Promise<KeptSentence[]> {
  const sentences = await getKeptSentences();
  const next = sentences.filter((s) => s.text !== text);
  await saveKeptSentences(next);
  return next;
}
