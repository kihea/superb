// The shell/storage boundary for book reading: where the reader is in each
// book, and which books sit on their shelf. Ordinary reading records
// nothing else -- no encounter log, no signals, nothing the engine ever
// sees. This module never imports the engine.
import {
  clearBookState,
  loadBookPlaces,
  loadShelf,
  saveBookPlaces,
  saveShelf,
} from "../storage/db";

export interface BookPlace {
  bookId: string;
  partIndex: number;
  blockIndex: number;
  updatedAt: number;
}

export interface ShelfEntry {
  bookId: string;
  addedAt: number;
  /** Set when the reader turns the last page. Finished books frost over on
   *  the Shelf; they never disappear. */
  finishedAt?: number;
}

function isBookPlace(value: unknown): value is BookPlace {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<BookPlace>;
  return (
    typeof v.bookId === "string" &&
    typeof v.partIndex === "number" &&
    Number.isInteger(v.partIndex) &&
    v.partIndex >= 0 &&
    typeof v.blockIndex === "number" &&
    Number.isInteger(v.blockIndex) &&
    v.blockIndex >= 0 &&
    typeof v.updatedAt === "number"
  );
}

function isShelfEntry(value: unknown): value is ShelfEntry {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<ShelfEntry>;
  return typeof v.bookId === "string" && typeof v.addedAt === "number";
}

/** `null` covers both "no place saved yet" and "what was saved does not
 *  look like a place" -- the reader treats both the same way (start this
 *  book from its first page), and only a storage *error* (a rejected
 *  promise) reaches the calm retry/reset screen. */
export async function getPlace(bookId: string): Promise<BookPlace | null> {
  const places = await loadBookPlaces<unknown>();
  const raw = places[bookId];
  if (!isBookPlace(raw)) return null;
  return raw;
}

export async function setPlace(place: BookPlace): Promise<void> {
  const places = await loadBookPlaces<unknown>();
  places[place.bookId] = place;
  await saveBookPlaces(places);
}

export async function getAllPlaces(): Promise<BookPlace[]> {
  const places = await loadBookPlaces<unknown>();
  return Object.values(places).filter(isBookPlace);
}

export async function getShelf(): Promise<ShelfEntry[]> {
  const raw = await loadShelf<unknown>();
  return raw.filter(isShelfEntry);
}

export async function addToShelf(bookId: string, now: number): Promise<ShelfEntry[]> {
  const entries = await getShelf();
  if (entries.some((e) => e.bookId === bookId)) return entries;
  const next = [...entries, { bookId, addedAt: now }];
  await saveShelf(next);
  return next;
}

export async function removeFromShelf(bookId: string): Promise<ShelfEntry[]> {
  const entries = await getShelf();
  const next = entries.filter((e) => e.bookId !== bookId);
  await saveShelf(next);
  return next;
}

export async function markFinished(bookId: string, now: number): Promise<ShelfEntry[]> {
  const entries = await getShelf();
  const next = entries.map((e) => (e.bookId === bookId ? { ...e, finishedAt: now } : e));
  if (!next.some((e) => e.bookId === bookId)) next.push({ bookId, addedAt: now, finishedAt: now });
  await saveShelf(next);
  return next;
}

/** The reader-initiated reset path (the "start over" button on the calm
 *  error screen) -- never called automatically. Clears places, the shelf,
 *  and kept words together. */
export async function resetBookReadingState(): Promise<void> {
  await clearBookState();
}
