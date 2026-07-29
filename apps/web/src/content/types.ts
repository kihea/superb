// The shapes actually on disk in content/passages and content/sources
// (docs/seams.md §"Seam 2"). Not the engine's view (that's engine/port.ts)
// -- this is what the shell's own content store holds, keyed by id, so it
// can resolve a Passage effect (which only carries an id and fills) back
// into renderable text.

export interface ComposedPassage {
  id: string;
  pool: "composed";
  topic: string;
  text: string;
  slots: { index: number; class: string; defaultWord: string }[];
}

/** ADR-026: the signal class(es) that claimed a sourced word — the same
 *  enum `content/schema/source.schema.json` fixes. */
export type ExcerptSignal =
  | "apposition"
  | "definition-marker"
  | "gloss-overlap"
  | "hand-picked";

export interface SourceExcerptWord {
  word: string;
  signals: ExcerptSignal[];
}

/** `content/classes/*.json` -- the lexicon docs/seams.md's `wordClasses`
 *  comes from. A word may belong to more than one class in principle,
 *  though `content/classes/_seed.py`'s own table assigns each word to
 *  exactly one today. */
export interface WordClass {
  id: string;
  pos: string;
  description: string;
  fixture: string;
  members: string[];
}

export interface SourceExcerpt {
  id: string;
  pool: "sourced";
  text: string;
  words: SourceExcerptWord[];
  /** T3b is backfilling this onto the 60 existing excerpts (docs/seams.md's
   *  second same-day amendment: "a sourced excerpt its own topic labelling").
   *  Optional here because it has not landed on dev as of this build --
   *  content/store.ts treats a missing one exactly as the seam says an
   *  unlabelled passage should be treated: legal, and not penalised. */
  topic?: string;
  provenance: {
    work: string;
    author: string;
    year: number;
    source: string;
    url: string;
    licence: string;
    retrieved: string;
  };
}
