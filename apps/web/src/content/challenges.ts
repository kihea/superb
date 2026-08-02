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
  const prompts = index.answers[word];
  if (!prompts) return "unknown";
  return prompts.includes(promptIndex) ? "connected" : "unconnected";
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
