// Choosing the sense the sentence actually uses. A gloss table entry may
// carry several tagged senses ("sound" the noise, "sound" the healthy,
// "sound" the strait); this module reads the sentence around the tapped
// word and picks the one that fits, the way a person would.
//
// Two signals, both cheap and both explainable:
//   1. part of speech, inferred from the words right around the tap
//      ("the ___" is a noun, "to ___" and -ed forms are verbs, "very ___"
//      is an adjective) and from the word's own shape;
//   2. overlap between a sense's own wording and the sentence's content
//      words — a sense that talks about what the sentence talks about.
//
// When neither signal reaches anything, the entry's default definition
// stands — that default is already ordered sensibly at build time
// (inflected readings first, then the part of speech the word usually is).

import { useEffect, useState } from "react";
import type { BookGlossEntry, GlossSense } from "./glosses";
import { loadSharedSenses } from "./glosses";

const CONTEXT_STOPWORDS = new Set([
  "that", "this", "with", "from", "have", "were", "when", "what", "into",
  "only", "their", "there", "which", "would", "could", "should", "about",
  "them", "then", "than", "they", "your", "will", "been", "being", "over",
]);

/** "n" | "v" | "adj" | "adv" | "" — the same shape heuristics the Viewer
 *  project runs, plus plain English morphology. */
export function inferPos(word: string, context: string): string {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const before = (kind: string) => new RegExp(`\\b(?:${kind})\\s+${escaped}\\b`, "i");
  if (before("to|will|would|shall|should|can|could|may|might|must|did|does|do|not").test(context))
    return "verb";
  if (before("a|an|the|this|that|these|those|my|your|his|her|its|our|their|no|any|some|every|each").test(context))
    return "noun";
  if (before("very|more|most|so|too|quite|rather|less|least").test(context)) return "adj";
  if (/(?:ed|ing)$/.test(word) && word.length > 4) return "verb";
  if (/ly$/.test(word) && word.length > 3) return "adv";
  if (/(?:ous|ful|ive|able|ible|ic|ish|less)$/.test(word) && word.length > 4) return "adj";
  return "";
}

function contentTerms(text: string): Set<string> {
  const terms = new Set<string>();
  for (const term of text.toLowerCase().match(/[a-z]{4,}/g) ?? []) {
    if (!CONTEXT_STOPWORDS.has(term)) terms.add(term);
  }
  return terms;
}

/** The shared sense lists, loaded once per session; `null` until they
 *  arrive. Cards keep rendering the default definition meanwhile. */
export function useSharedSenses(): Record<string, GlossSense[]> | null {
  const [table, setTable] = useState<Record<string, GlossSense[]> | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadSharedSenses().then((loaded) => {
      if (!cancelled) setTable(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return table;
}

function sensesFor(
  word: string,
  entry: BookGlossEntry,
  shared: Record<string, GlossSense[]> | null | undefined,
): GlossSense[] | undefined {
  if (entry.senses) return entry.senses;
  const plain = word.toLowerCase().replace(/’/g, "'");
  return shared?.[plain] ?? shared?.[plain.replace(/'s$/, "")];
}

/** The definition to show for `word` inside `context`. Falls back to the
 *  entry's own default when the entry has one sense or no context helps. */
export function pickDefinition(
  word: string,
  entry: BookGlossEntry,
  context?: string,
  shared?: Record<string, GlossSense[]> | null,
): string {
  const senses = sensesFor(word, entry, shared);
  if (!senses || senses.length < 2 || !context) return entry.definition;

  const pos = inferPos(word, context);
  const terms = contentTerms(context);

  let best: GlossSense | null = null;
  let bestScore = 0;
  senses.forEach((sense, index) => {
    let score = 0;
    if (pos && sense.pos === pos) score += 6;
    for (const term of contentTerms(sense.def)) {
      if (terms.has(term)) score += 2;
    }
    // A word's earlier senses are its likelier ones (the build ordered
    // them); a whisper of a prior, never enough to beat a real signal.
    score += Math.max(0, 1 - index * 0.25);
    if (score > bestScore) {
      bestScore = score;
      best = sense;
    }
  });

  // Below this the "match" is only the ordering prior restated — the
  // default definition already says the same thing more honestly.
  return best !== null && bestScore >= 2 ? (best as GlossSense).def : entry.definition;
}
