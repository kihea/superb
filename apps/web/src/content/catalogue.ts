// The shell's catalogue store -- the library and book-detail screens' only
// door into real book data (content/catalogue.lock.json, Slice 1A card).
// Fetched and cached the same way content/store.ts already caches
// sources.json: explicitly, with the Cache API, so the first load works
// before any service worker controls the page (see that file's own comment).
import type { CatalogueArtifact, CatalogueBook } from "./catalogueTypes";

const CONTENT_CACHE = "superb-content-v1";
const contentUrl = (name: string) => `${import.meta.env.BASE_URL}content/${name}`;

let artifact: CatalogueArtifact | null = null;
let loadError: Error | null = null;

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

/** Loads once per session and remembers a load failure rather than retrying
 *  it silently on every call -- the retry is a reader action (see
 *  BookReader.tsx and Library.tsx's own error states), not a background
 *  loop. Call `resetCatalogue()` first to actually retry. */
export async function loadCatalogue(): Promise<CatalogueArtifact> {
  if (artifact) return artifact;
  if (loadError) throw loadError;
  try {
    artifact = await fetchJson<CatalogueArtifact>(contentUrl("catalogue-v0.1.0.json"));
    return artifact;
  } catch (err) {
    loadError = err instanceof Error ? err : new Error(String(err));
    throw loadError;
  }
}

/** Clears the remembered failure (and, for a schema mismatch rather than a
 *  network failure, the cached artifact too) so the next `loadCatalogue()`
 *  actually tries again instead of replaying the same rejected promise. */
export function resetCatalogue(): void {
  artifact = null;
  loadError = null;
}

function words(book: CatalogueBook): string {
  return `${book.title} ${book.author}`.toLowerCase();
}

/** Title/author substring search -- Library.tsx's whole query. Empty query
 *  returns every book in the artifact (today, one). */
export async function searchBooks(query: string): Promise<CatalogueBook[]> {
  const { books } = await loadCatalogue();
  const q = query.trim().toLowerCase();
  if (!q) return books;
  return books.filter((book) => words(book).includes(q));
}

export async function getBook(id: string): Promise<CatalogueBook | undefined> {
  const { books } = await loadCatalogue();
  return books.find((book) => book.id === id);
}
