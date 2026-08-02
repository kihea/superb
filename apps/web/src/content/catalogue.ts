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

// The library repository, served raw through jsDelivr's CDN. The books are
// public domain and the repository is public; nothing here is a service of
// ours that could go missing separately from the catalogue itself.
const LIBRARY_BASE = "https://cdn.jsdelivr.net/gh/superb-catalogue/library@main/books";

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

/** The library repository's own book.json shape. */
interface LibraryBook {
  title: string;
  author: string;
  language: string;
  chapters: { label: string; types: string[]; blocks: { type: string; text: string }[] }[];
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

function partsFromLibrary(book: LibraryBook): CataloguePart[] {
  return book.chapters.map((chapter, i) => ({
    index: i,
    label: chapter.label,
    heading: [],
    blocks: chapter.blocks.filter((b) => typeof b.text === "string" && b.text.length > 0),
  }));
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
