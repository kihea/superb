// The shell's catalogue store. Two layers, fetched and cached the same way
// content/store.ts caches sources.json:
//
//   - the index: one small row per book (content/catalogue-index.json,
//     generated from the library repository), enough for the Library and
//     book-cover screens;
//   - the text: one book.json per book, fetched from the library's own
//     public repository when the reader actually opens it, then held in
//     the Cache API so a book once opened reads offline.
import type { CatalogueBook, CataloguePart, CatalogueArtifact } from "./catalogueTypes";

const CONTENT_CACHE = "superb-content-v1";
const contentUrl = (name: string) => `${import.meta.env.BASE_URL}content/${name}`;

// The library, served from our own zone: superb.works/catalogue/* is the
// site's edge worker proxying the public library repository, cached at the
// edge. Our own address rather than a public CDN mirror so that crawler
// policy (the AI-crawler 402, Cloudflare's zone controls) actually applies
// to the serving of these books; a reader and this app pass through freely.
const LIBRARY_BASE = "https://superb.works/catalogue/books";

export interface CatalogueIndexRow {
  id: string;
  title: string;
  author: string;
  translator?: string;
  language: string;
  wordCount: number;
  chapterCount: number;
  chapterLabels: string[];
  categories: string[];
  shape: string;
  firstLine?: string;
  description?: string;
}

interface CatalogueIndexFile {
  version: string;
  bookCount: number;
  books: CatalogueIndexRow[];
}

/** The library repository's own book.json shape. Blocks nest: a poem is a
 *  container whose stanzas and lines are children, a play's dialogue can
 *  live in table rows. Text sits wherever the edition put it. */
interface LibraryBlock {
  type: string;
  text?: string;
  blocks?: LibraryBlock[];
}

interface LibraryBook {
  title: string;
  author: string;
  language: string;
  chapters: { label: string; types: string[]; blocks: LibraryBlock[] }[];
}

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

let index: CatalogueIndexFile | null = null;
let indexError: Error | null = null;
let artifact: CatalogueArtifact | null = null;
const books = new Map<string, CatalogueBook>();

/** Loads once per session and remembers a load failure rather than
 *  retrying it silently on every call -- the retry is a reader action.
 *  Call `resetCatalogue()` first to actually retry. */
export async function loadIndex(): Promise<CatalogueIndexRow[]> {
  if (index) return index.books;
  if (indexError) throw indexError;
  try {
    index = await fetchJson<CatalogueIndexFile>(contentUrl("catalogue-index.json"));
    return index.books;
  } catch (err) {
    indexError = err instanceof Error ? err : new Error(String(err));
    throw indexError;
  }
}

export function resetCatalogue(): void {
  index = null;
  indexError = null;
}

export async function getIndexRow(id: string): Promise<CatalogueIndexRow | undefined> {
  const rows = await loadIndex();
  return rows.find((row) => row.id === id);
}

interface DescriptionFile {
  version: number;
  source: string;
  licence: string;
  descriptions: Record<string, string[]>;
}

let descriptions: DescriptionFile | null = null;

/** What the edition's publisher says the book is, in their words. Standard
 *  Ebooks writes one for every edition and dedicates it to the public domain
 *  under CC0; scripts/fetch-descriptions.mjs collected them once. Returns an
 *  empty list rather than throwing — a book page without a description is
 *  still a book page. */
export async function getDescription(id: string): Promise<string[]> {
  if (!descriptions) {
    try {
      descriptions = await fetchJson<DescriptionFile>(contentUrl("catalogue-descriptions.json"));
    } catch {
      return [];
    }
  }
  return descriptions.descriptions[id] ?? [];
}

/** Title/author substring search, optionally narrowed to a category. */
export async function searchBooks(query: string, category?: string): Promise<CatalogueIndexRow[]> {
  const rows = await loadIndex();
  const q = query.trim().toLowerCase();
  let hits = rows;
  if (category) hits = hits.filter((row) => row.categories.includes(category));
  if (q) hits = hits.filter((row) => `${row.title} ${row.author}`.toLowerCase().includes(q));
  return hits;
}

/** The vendored single-book artifact that predates the full index. Its one
 *  book (Dracula) keeps its richer parts -- separated headings, provenance
 *  -- so it stays the preferred source where it applies. */
async function loadArtifact(): Promise<CatalogueArtifact | null> {
  if (artifact) return artifact;
  try {
    artifact = await fetchJson<CatalogueArtifact>(contentUrl("catalogue-v0.1.0.json"));
    return artifact;
  } catch {
    return null;
  }
}

// Depth-first: every block that carries text is a reading block, wherever
// the edition nested it. Keeping only the top level rendered dramas and
// poetry collections as blank pages — Agamemnon's whole dialogue lives in
// a table's rows, Bierce's poems inside poem/part containers — because
// their text is all children. This mirrors the walk the gloss pipeline
// already does (data/pipeline/book_glosses.py's iter_texts), so what the
// reader sees and what the tables cover are the same text again.
function flattenBlocks(blocks: LibraryBlock[], out: { type: string; text: string }[]): void {
  for (const block of blocks) {
    if (typeof block.text === "string" && block.text.length > 0) {
      // A cell that is only a number is the edition's own line-numbering
      // apparatus (verse dramas carry one every few lines), not reading.
      if (!/^\d+$/.test(block.text.trim())) {
        out.push({ type: block.type, text: block.text });
      }
    }
    if (block.blocks && block.blocks.length > 0) flattenBlocks(block.blocks, out);
  }
}

function partsFromLibrary(book: LibraryBook): CataloguePart[] {
  return book.chapters.map((chapter, i) => {
    const blocks: { type: string; text: string }[] = [];
    flattenBlocks(chapter.blocks, blocks);
    // Some editions leave a chapter unlabelled (null in book.json); the
    // type says string, so make it one here rather than letting the null
    // surface as a crash in whatever screen prints the label.
    return { index: i, label: chapter.label ?? "", heading: [], blocks };
  });
}

/** The whole book, ready to read. */
export async function getBook(id: string): Promise<CatalogueBook | undefined> {
  const known = books.get(id);
  if (known) return known;

  const vendored = await loadArtifact();
  const inArtifact = vendored?.books.find((book) => book.id === id);
  if (inArtifact) {
    books.set(id, inArtifact);
    return inArtifact;
  }

  const row = await getIndexRow(id);
  if (!row) return undefined;

  const raw = await fetchJson<LibraryBook>(`${LIBRARY_BASE}/${id}/book.json`);
  const book: CatalogueBook = {
    id,
    title: raw.title,
    author: raw.author,
    translator: row.translator ?? null,
    language: raw.language,
    shape: (row.shape as CatalogueBook["shape"]) ?? "prose",
    wordCount: row.wordCount,
    parts: partsFromLibrary(raw),
    provenance: {
      workPage: "",
      publisher: "",
      editionPublished: "",
      madeFrom: [],
      licence: "Public domain",
      licenceUri: "",
      asStatedByTheEdition: "",
    },
  };
  books.set(id, book);
  return book;
}
