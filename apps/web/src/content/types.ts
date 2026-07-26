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

export interface SourceExcerpt {
  id: string;
  pool: "sourced";
  text: string;
  words: string[];
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
