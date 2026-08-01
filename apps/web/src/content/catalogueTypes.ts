// The shape of content/catalogue/catalogue-v0.1.0.json (Slice 1A card,
// PLAN.md §7): a versioned, checksummed export from superb-catalogue/library
// (scripts/export_catalogue.py there), not that repository's own internal
// book.json/provenance.json shape. See content/catalogue.lock.json for where
// this build's copy came from.

/** One block of a chapter's own reading text, in document order. `type` is
 *  carried straight from the source repository's block type (paragraph,
 *  valediction, verse, dateline, ...) so a later slice can render a shape
 *  other than plain prose without this type changing again -- Slice 1A
 *  itself renders every block the same way (see BookReader.tsx), since law 3
 *  ("every word an identical tap target") applies at the paragraph level
 *  here for the same reason it applies at the word level in PassagePage. */
export interface CatalogueTextBlock {
  type: string;
  text: string;
}

export interface CataloguePart {
  index: number;
  /** As the book's own table of contents states it -- often not a
   *  descriptive title (HOW-THE-FIRST-BOOK-WENT.md #3: Dracula's chapters
   *  are "I", "II", ...). Never invented here. */
  label: string;
  /** The publisher's own chapter-heading lines (a narrator's name, "kept in
   *  shorthand", ...), kept separately from `blocks` rather than mixed into
   *  the reading text -- the source repository's own header/bridgehead
   *  block types. */
  heading: string[];
  blocks: CatalogueTextBlock[];
}

export interface CatalogueProvenance {
  workPage: string;
  publisher: string;
  editionPublished: string;
  madeFrom: string[];
  licence: string;
  licenceUri: string;
  asStatedByTheEdition: string;
}

export interface CatalogueBook {
  id: string;
  title: string;
  author: string;
  translator: string | null;
  language: string;
  shape: "prose" | "poetry" | "play";
  wordCount: number;
  parts: CataloguePart[];
  provenance: CatalogueProvenance;
}

export interface CatalogueArtifact {
  schema_version: string;
  generated_at: string;
  source: { repository: string; commit: string };
  books: CatalogueBook[];
}
