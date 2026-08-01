// The shell/storage boundary for whole-book reading (Slice 1A card,
// PLAN.md §7). Two concerns, kept apart on purpose:
//
//   - place: where the reader is (book/part/location), so a reload resumes
//     instead of restarting;
//   - encounters: a log of what the reader has seen, timestamped by the
//     shell (never the engine -- superb-core stays pure, law 2).
//
// ADR-031's safety gate: a book encounter is RECORDED and CONSUMES NOTHING.
// This module never imports the engine and never calls anything in
// storage/db.ts's STORE (the engine's own bytes) -- it only ever touches
// BOOK_STORE, a separate IndexedDB object store db.ts created for exactly
// this reason. There is no code path from here into theta, its error, or
// the due list.
import {
  clearBookState,
  loadBookEncounters,
  loadBookPlace,
  saveBookEncounters,
  saveBookPlace,
} from "../storage/db";

export interface BookPlace {
  bookId: string;
  partIndex: number;
  blockIndex: number;
  updatedAt: number;
}

export interface BookEncounter {
  id: string;
  bookId: string;
  partIndex: number;
  blockIndex: number;
  word: string;
  /** A short excerpt around the word -- an audit trail for this log, never
   *  rendered back to the reader (law 3: target words are never marked, and
   *  showing "you were just asked about this" would do exactly that). */
  context: string;
  at: number;
}

const CONTEXT_MAX = 240;
// Generous but bounded -- this is a local audit log, not a growing database.
// A reader who reads for years should not carry an unbounded IndexedDB
// value; the oldest encounters are the least useful ones to have kept.
const ENCOUNTERS_CAP = 2000;

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

function isBookEncounter(value: unknown): value is BookEncounter {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<BookEncounter>;
  return (
    typeof v.id === "string" &&
    typeof v.bookId === "string" &&
    typeof v.partIndex === "number" &&
    typeof v.blockIndex === "number" &&
    typeof v.word === "string" &&
    typeof v.context === "string" &&
    typeof v.at === "number"
  );
}

/** `null` covers both "no place saved yet" and "what was saved does not
 *  look like a place" -- BookReader.tsx treats both the same way (start
 *  this book from its first page), and only a storage *error* (a rejected
 *  promise) reaches the calm retry/reset screen. A shape that fails to
 *  parse is not corruption worth alarming a reader over; it is legitimately
 *  ambiguous state a fresh open already resolves correctly. */
export async function getPlace(bookId: string): Promise<BookPlace | null> {
  const raw = await loadBookPlace<unknown>();
  if (!isBookPlace(raw) || raw.bookId !== bookId) return null;
  return raw;
}

export async function setPlace(place: BookPlace): Promise<void> {
  await saveBookPlace(place);
}

/** Appends one encounter and returns it. `now` is supplied by the caller
 *  (the shell) rather than read in here -- keeps this module's own contract
 *  the same shape as the engine's (`now` is a parameter, never read from a
 *  clock), even though this module sits entirely outside the engine. */
export async function recordEncounter(
  input: Omit<BookEncounter, "id" | "at" | "context"> & { context: string },
  now: number,
): Promise<BookEncounter> {
  const encounter: BookEncounter = {
    id: `enc-${now}-${Math.random().toString(36).slice(2, 8)}`,
    at: now,
    ...input,
    context: input.context.slice(0, CONTEXT_MAX),
  };
  const existing = await loadBookEncounters<unknown>();
  const valid = existing.filter(isBookEncounter);
  const next = [...valid, encounter].slice(-ENCOUNTERS_CAP);
  await saveBookEncounters(next);
  return encounter;
}

export async function getEncounters(bookId?: string): Promise<BookEncounter[]> {
  const raw = await loadBookEncounters<unknown>();
  const valid = raw.filter(isBookEncounter);
  return bookId ? valid.filter((e) => e.bookId === bookId) : valid;
}

/** The reader-initiated reset path (BookReader.tsx's "start over" button on
 *  the calm error screen) -- never called automatically. */
export async function resetBookReadingState(): Promise<void> {
  await clearBookState();
}
