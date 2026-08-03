// Choosing the sense the sentence actually uses. A gloss table entry may
// carry several tagged senses ("sound" the noise, "sound" the healthy,
// "sound" the strait); this module reads the sentence around the tapped
// word and picks the one that fits, the way a person would.
//
// Three signals, all cheap and all explainable:
//   1. the word's own case: a mid-sentence capital ("the English
//      countryside") points at the senses that live under the capital
//      headword — the language, the people — and a lowercase word points
//      away from them (the billiards "english" stays for billiards);
//   2. part of speech, inferred from the words right around the tap. The
//      subtle one is the determiner: "a sound of bells" makes sound a
//      noun, but "an ancient English Cathedral" does NOT make ancient a
//      noun — a determiner starts a noun PHRASE, and only the word that
//      closes the phrase is the noun. So what follows the word decides;
//   3. overlap between a sense's own wording and the sentence's content
//      words — a sense that talks about what the sentence talks about.
//
// When nothing reaches anything, the entry's default definition stands —
// already ordered sensibly at build time (inflected readings first, then
// the part of speech the word usually is, lowercase before capital).

import { useEffect, useState } from "react";
import type { BookGlossEntry, GlossSense } from "./glosses";
import { loadSharedSenses } from "./glosses";

const CONTEXT_STOPWORDS = new Set([
  "that", "this", "with", "from", "have", "were", "when", "what", "into",
  "only", "their", "there", "which", "would", "could", "should", "about",
  "them", "then", "than", "they", "your", "will", "been", "being", "over",
]);

// Words that, appearing right AFTER a determiner-led word, close the noun
// phrase there — so the word before them was the noun, not a modifier.
const PHRASE_CLOSERS = new Set([
  "of", "in", "on", "at", "to", "for", "with", "from", "by", "as", "and",
  "or", "but", "that", "which", "who", "than", "was", "is", "are", "were",
  "had", "has", "have", "will", "would", "could", "should", "did", "does",
  "came", "went", "seemed", "became", "stood", "lay", "kept", "gave",
  "between", "among", "upon", "into", "onto", "over", "under", "through",
  "across", "behind", "beyond", "before", "after", "against", "without",
  "within", "toward", "towards", "near", "off", "down", "up", "out",
]);

/** "noun" | "verb" | "adj" | "adv" | "" from the sentence's shape. */
export function inferPos(word: string, context: string): string {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const before = (kind: string) => new RegExp(`\\b(?:${kind})\\s+${escaped}\\b`, "i");
  if (before("to|will|would|shall|should|can|could|may|might|must|did|does|do|not").test(context))
    return "verb";
  if (before("very|more|most|so|too|quite|rather|less|least").test(context)) return "adj";

  const afterDeterminer = before(
    "a|an|the|this|that|these|those|my|your|his|her|its|our|their|no|any|some|every|each",
  ).test(context);
  if (afterDeterminer) {
    // The determiner starts a noun phrase; whether THIS word is the noun
    // depends on what follows it. "a sound of bells" — "of" closes the
    // phrase, sound is the noun. "an ancient English Cathedral" — another
    // content word follows, so ancient is only dressing the noun.
    const following = new RegExp(`\\b${escaped}\\s+([a-zA-Z']+)`, "i").exec(context)?.[1];
    if (!following || PHRASE_CLOSERS.has(following.toLowerCase()) || /(?:ed|ly)$/.test(following)) {
      return "noun";
    }
    return "adj";
  }

  if (/(?:ed|ing)$/.test(word) && word.length > 4) return "verb";
  if (/ly$/.test(word) && word.length > 3) return "adv";
  if (/(?:ous|ful|ive|able|ible|ic|ish|less|ent|ant|al)$/.test(word) && word.length > 5)
    return "adj";
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

/** Whether the tapped word wears a meaningful capital: uppercase first
 *  letter, and not merely because it opens the sentence. */
function wearsCapital(word: string, context?: string): boolean {
  if (!/^[A-Z]/.test(word)) return false;
  if (!context) return true;
  const at = context.indexOf(word);
  if (at <= 0) return at !== 0; // opens the context: no case signal at all
  // Sentence-initial inside the context — ". The" — is no signal either.
  return !/[.!?…]\s*$/.test(context.slice(0, at));
}

/** The definition to show for `word` inside `context`. Falls back to the
 *  entry's own default when the entry has one sense or no signal helps. */
export function pickDefinition(
  word: string,
  entry: BookGlossEntry,
  context?: string,
  shared?: Record<string, GlossSense[]> | null,
): string {
  const senses = sensesFor(word, entry, shared);
  if (!senses || senses.length < 2) return entry.definition;

  const capital = wearsCapital(word, context);
  const pos = context ? inferPos(word.toLowerCase(), context) : "";
  const terms = context ? contentTerms(context) : new Set<string>();

  let best: GlossSense | null = null;
  let bestScore = 0;
  senses.forEach((sense, index) => {
    let score = 0;
    // Case outweighs everything: "English" mid-sentence IS the capital
    // word, whatever the syntax around it suggests.
    if (capital && sense.cap) score += 9;
    if (!capital && sense.cap) score -= 4;
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
