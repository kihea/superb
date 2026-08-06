// What you thought of a book.
//
// Superb has no server, so there is no pool of strangers' reviews to show and
// none is invented. What a book page can honestly carry is this: your own
// stars and your own review, and whatever came in with a Goodreads export —
// which is also yours. Where Goodreads' own community average arrived with an
// import it is shown as exactly that, attributed and dated, never merged into
// a number that pretends to be ours.
import { loadBookMarks, saveBookMarks } from "../storage/db";

export interface ImportedMark {
  from: "goodreads";
  at: number;
  /** Goodreads' community average at the moment of export, when the file
   *  carried one. Theirs, not ours, and labelled that way on screen. */
  averageRating?: number;
  /** Which Goodreads shelf the book was on: read, currently-reading, to-read. */
  shelf?: string;
  dateRead?: string;
  readCount?: number;
}

export interface BookMark {
  bookId: string;
  /** 1–5. Absent means unrated, which is different from rated zero. */
  stars?: number;
  review?: string;
  updatedAt: number;
  imported?: ImportedMark;
}

function isMark(value: unknown): value is BookMark {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<BookMark>;
  if (typeof v.bookId !== "string" || typeof v.updatedAt !== "number") return false;
  if (v.stars !== undefined && (typeof v.stars !== "number" || v.stars < 1 || v.stars > 5)) return false;
  if (v.review !== undefined && typeof v.review !== "string") return false;
  return true;
}

export async function getMarks(): Promise<Record<string, BookMark>> {
  const raw = await loadBookMarks<unknown>();
  const out: Record<string, BookMark> = {};
  for (const [id, mark] of Object.entries(raw)) if (isMark(mark)) out[id] = mark;
  return out;
}

export async function getMark(bookId: string): Promise<BookMark | null> {
  const marks = await getMarks();
  return marks[bookId] ?? null;
}

/** Writes only the fields given, so rating a book you have already reviewed
 *  does not silently drop the review. */
export async function setMark(bookId: string, patch: Partial<Omit<BookMark, "bookId">>): Promise<BookMark> {
  const marks = await getMarks();
  const next: BookMark = { ...(marks[bookId] ?? { bookId, updatedAt: 0 }), ...patch, bookId, updatedAt: Date.now() };
  // An empty review is no review, not an empty one.
  if (next.review !== undefined && next.review.trim() === "") delete next.review;
  marks[bookId] = next;
  await saveBookMarks(marks);
  return next;
}

export async function clearMark(bookId: string): Promise<void> {
  const marks = await getMarks();
  delete marks[bookId];
  await saveBookMarks(marks);
}

export async function putMarks(next: Record<string, BookMark>): Promise<void> {
  await saveBookMarks(next);
}
