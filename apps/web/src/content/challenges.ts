// The games' data door: rhyme prompts and pronunciations, association
// prompts and the answer index. Fetched and cached the same way the
// catalogue is. The judging rules live here too, so both game screens and
// their tests read one implementation.

const CONTENT_CACHE = "superb-content-v1";
const contentUrl = (name: string) => `${import.meta.env.BASE_URL}content/${name}`;

async function fetchJson<T>(url: string): Promise<T> {
  if (!("caches" in window)) return fetch(url).then((r) => r.json() as Promise<T>);
  const cache = await caches.open(CONTENT_CACHE);
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} responded ${response.status}`);
    await cache.put(url, response.clone());
    return (await response.json()) as T;
  } catch (networkError) {
    const cached = await cache.match(url);
    if (cached) return (await cached.json()) as T;
    throw networkError;
  }
}

// ── Rhyme ──

export interface RhymeReveal {
  word: string;
  kind: "exact" | "near";
}

export interface RhymePrompt {
  word: string;
  exact: RhymeReveal[];
  near: RhymeReveal[];
}

interface RhymeFile {
  source: string;
  note: string;
  tiers: Record<string, RhymePrompt[]>;
}

/** word -> [rimeKey, nucleusKey, syllableCount] */
export type Pronunciations = Record<string, [string, string, number]>;

let rhymeFile: RhymeFile | null = null;
let pronunciations: Pronunciations | null = null;

export async function loadRhymes(): Promise<Record<string, RhymePrompt[]>> {
  if (!rhymeFile) rhymeFile = await fetchJson<RhymeFile>(contentUrl("challenges/rhyme-prompts.json"));
  return rhymeFile.tiers;
}

export async function loadPronunciations(): Promise<Pronunciations> {
  if (!pronunciations)
    pronunciations = await fetchJson<Pronunciations>(contentUrl("challenges/pronunciations.json"));
  return pronunciations;
}

export type RhymeJudgement = "exact" | "near" | "none" | "same" | "unknown";

/** Rough shared-stem check so "bake"/"baked" never counts as a rhyme. */
function sameStem(a: string, b: string): boolean {
  const strip = (w: string) => w.replace(/(ings?|ies|ed|es|s|ly)$/, "");
  const sa = strip(a);
  const sb = strip(b);
  return sa === sb || sa.startsWith(sb) || sb.startsWith(sa);
}

export function judgeRhyme(prompt: string, answer: string, prons: Pronunciations): RhymeJudgement {
  const word = answer.toLowerCase().trim();
  if (!word) return "unknown";
  if (word === prompt) return "same";
  if (sameStem(word, prompt)) return "same";
  const p = prons[prompt];
  const a = prons[word];
  if (!p || !a) return "unknown";
  if (p[0] === a[0]) return "exact";
  if (p[1] === a[1]) return "near";
  return "none";
}

// The sounds a rime key is made of, spelled the way a reader would say
// them: "AY1 K" becomes "eye·k". Not phonetics teaching — just enough to
// say WHY two words ring together.
const VOWEL_SOUNDS: Record<string, string> = {
  AA: "ah", AE: "a", AH: "uh", AO: "aw", AW: "ow", AY: "eye",
  EH: "eh", ER: "er", EY: "ay", IH: "ih", IY: "ee", OW: "oh",
  OY: "oy", UH: "uu", UW: "oo",
};

function soundOf(phone: string): string {
  const bare = phone.replace(/\d/g, "");
  return VOWEL_SOUNDS[bare] ?? bare.toLowerCase();
}

/** How `word` rings with `prompt`, in plain words — "rings on “eye·k”" for
 *  a full rhyme, "shares the “eye” sound" for a near one. Null when the
 *  dictionary can't say. */
export function describeRhyme(prompt: string, word: string, prons: Pronunciations): string | null {
  const p = prons[prompt];
  const a = prons[word.toLowerCase()];
  if (!p || !a) return null;
  if (p[0] === a[0]) {
    const sound = p[0].split(" ").map(soundOf).join("·");
    return `rings on “${sound}”`;
  }
  if (p[1] === a[1]) {
    return `shares the “${soundOf(p[1])}” sound, lands differently`;
  }
  return null;
}

// ── Association ──

export interface Associate {
  word: string;
  /** Plain-language label: "means the same", "opposite", "a kind of it", ... */
  connection: string;
  wn: boolean;
  pmi: boolean;
}

export interface AssociationPrompt {
  word: string;
  associates: Associate[];
}

interface AssociationFile {
  sources: unknown;
  note: string;
  tiers: Record<string, AssociationPrompt[]>;
}

export interface AssociationIndex {
  prompts: string[];
  answers: Record<string, number[]>;
}

let associationFile: AssociationFile | null = null;
let associationIndex: AssociationIndex | null = null;

export async function loadAssociations(): Promise<Record<string, AssociationPrompt[]>> {
  if (!associationFile)
    associationFile = await fetchJson<AssociationFile>(contentUrl("challenges/association.json"));
  return associationFile.tiers;
}

export async function loadAssociationIndex(): Promise<AssociationIndex> {
  if (!associationIndex)
    associationIndex = await fetchJson<AssociationIndex>(contentUrl("challenges/association-index.json"));
  return associationIndex;
}

export type AssociationJudgement = "connected" | "unconnected" | "same" | "unknown";

/** Plain inflection candidates for an answer, most specific first — the
 *  judge's index holds base forms, and "punches" or "bowling"'s plural
 *  kin should not miss for spelling alone. */
function answerForms(word: string): string[] {
  const forms = [word];
  const add = (form: string) => {
    if (form.length >= 2 && !forms.includes(form)) forms.push(form);
  };
  if (word.endsWith("ies") && word.length > 4) add(word.slice(0, -3) + "y");
  if (word.endsWith("ied") && word.length > 4) add(word.slice(0, -3) + "y");
  if (word.endsWith("ing") && word.length > 4) {
    if (word.length > 5 && word[word.length - 4] === word[word.length - 5]) add(word.slice(0, -4));
    add(word.slice(0, -3) + "e");
    add(word.slice(0, -3));
  }
  if (word.endsWith("ed") && word.length > 3) {
    if (word.length > 4 && word[word.length - 3] === word[word.length - 4]) add(word.slice(0, -3));
    add(word.slice(0, -1));
    add(word.slice(0, -2));
  }
  if (word.endsWith("es") && word.length > 3) add(word.slice(0, -2));
  if (word.endsWith("s") && word.length > 2 && !word.endsWith("ss")) add(word.slice(0, -1));
  return forms;
}

export function judgeAssociation(
  prompt: string,
  answer: string,
  index: AssociationIndex,
): AssociationJudgement {
  const word = answer.toLowerCase().trim();
  if (!word) return "unknown";
  if (word === prompt || sameStem(word, prompt)) return "same";
  const promptIndex = index.prompts.indexOf(prompt);
  if (promptIndex === -1) return "unknown";
  let sawEntry = false;
  for (const form of answerForms(word)) {
    const prompts = index.answers[form];
    if (!prompts) continue;
    sawEntry = true;
    if (prompts.includes(promptIndex)) return "connected";
  }
  return sawEntry ? "unconnected" : "unknown";
}

/** The seven tiers, in playing order. */
export const TIERS = ["1", "2", "3", "4", "5", "6", "7"] as const;

export const TIER_NAMES: Record<string, string> = {
  "1": "Plain",
  "2": "Steady",
  "3": "Sharp",
  "4": "Uncommon",
  "5": "Rare",
  "6": "Difficult",
  "7": "Formidable",
};

/** A deterministic-enough shuffle seed is not needed here: the games are
 *  meant to be random every round. */
export function randomPrompt<T>(list: T[], avoid?: T): T {
  if (list.length === 1) return list[0];
  let pick = list[Math.floor(Math.random() * list.length)];
  let guard = 0;
  while (pick === avoid && guard < 5) {
    pick = list[Math.floor(Math.random() * list.length)];
    guard += 1;
  }
  return pick;
}
