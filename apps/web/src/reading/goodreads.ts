// Bringing a reading life in from Goodreads, and letting it out again.
//
// Goodreads shut its API down in 2020, so the only honest door is the one it
// still leaves open: My Books → Import and export → Export Library, which
// gives you a CSV of everything you have shelved, rated and reviewed. This
// module reads that file and writes one back in the same shape, so a reader
// can walk in and — just as importantly — walk out.
//
// Matching is by title and author, because Goodreads' ids mean nothing here.
// It is deliberately conservative: a row that does not clearly name a book in
// this library is reported as unmatched rather than guessed at. A reader can
// see exactly what came in and what did not.
import type { CatalogueIndexRow } from "../content/catalogue";
import type { BookMark } from "./marks";
import type { ShelfEntry } from "./bookState";

export interface GoodreadsRow {
  title: string;
  author: string;
  myRating: number;
  averageRating?: number;
  myReview?: string;
  shelf?: string;
  dateRead?: string;
  readCount?: number;
}

export interface ImportResult {
  matched: { row: GoodreadsRow; book: CatalogueIndexRow }[];
  unmatched: GoodreadsRow[];
}

/* ── reading a CSV ───────────────────────────────────────────────────── */

/** A real CSV parser rather than a split on commas: Goodreads reviews carry
 *  commas, newlines and doubled quotes, and half an imported review is worse
 *  than none. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  // A BOM at the head of the file would otherwise become part of the first
  // column name and no header would ever match.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

function toCsv(rows: (string | number)[][]): string {
  const cell = (v: string | number) => {
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** Goodreads has renamed columns over the years and its export carries an
 *  author field twice ("Author" and "Author l-f"). Look the columns up by
 *  name so a file from any year still reads. */
export function readGoodreadsCsv(text: string): GoodreadsRow[] {
  const table = parseCsv(text);
  if (table.length < 2) return [];
  const header = table[0].map((h) => h.trim().toLowerCase());
  const at = (...names: string[]) => {
    for (const name of names) {
      const i = header.indexOf(name);
      if (i !== -1) return i;
    }
    return -1;
  };

  const cols = {
    title: at("title"),
    author: at("author", "author l-f"),
    myRating: at("my rating"),
    averageRating: at("average rating"),
    myReview: at("my review"),
    shelf: at("exclusive shelf"),
    dateRead: at("date read"),
    readCount: at("read count"),
  };
  if (cols.title === -1 || cols.author === -1) return [];

  const rows: GoodreadsRow[] = [];
  for (const line of table.slice(1)) {
    const get = (i: number) => (i === -1 ? "" : (line[i] ?? "").trim());
    const title = get(cols.title);
    if (!title) continue;
    const stars = Number(get(cols.myRating));
    const average = Number(get(cols.averageRating));
    const count = Number(get(cols.readCount));
    rows.push({
      title,
      author: get(cols.author),
      myRating: Number.isFinite(stars) ? stars : 0,
      averageRating: Number.isFinite(average) && average > 0 ? average : undefined,
      myReview: get(cols.myReview) || undefined,
      shelf: get(cols.shelf) || undefined,
      dateRead: get(cols.dateRead) || undefined,
      readCount: Number.isFinite(count) && count > 0 ? count : undefined,
    });
  }
  return rows;
}

/* ── matching a row to a book ────────────────────────────────────────── */

function fold(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Goodreads titles carry series and edition tails — "Dracula (Norton
 *  Critical Editions)" — and leading articles the library drops. */
function foldTitle(title: string): string {
  const withoutTail = title.replace(/\s*[([].*$/, "");
  return fold(withoutTail).replace(/^(the|a|an) /, "");
}

/** Surnames are the reliable part: Goodreads writes "Stoker, Bram" in one
 *  column and "Bram Stoker" in another, and translators wander between them. */
function surname(author: string): string {
  const folded = fold(author);
  if (author.includes(",")) return fold(author.split(",")[0]);
  const parts = folded.split(" ");
  return parts[parts.length - 1] ?? folded;
}

export function matchRows(rows: GoodreadsRow[], index: CatalogueIndexRow[]): ImportResult {
  const byTitle = new Map<string, CatalogueIndexRow[]>();
  for (const book of index) {
    const key = foldTitle(book.title);
    const list = byTitle.get(key);
    if (list) list.push(book);
    else byTitle.set(key, [book]);
  }

  const matched: ImportResult["matched"] = [];
  const unmatched: GoodreadsRow[] = [];
  for (const row of rows) {
    const candidates = byTitle.get(foldTitle(row.title));
    if (!candidates || candidates.length === 0) {
      unmatched.push(row);
      continue;
    }
    // One candidate on the title alone is taken; several means the author
    // has to agree before anything is written.
    const wanted = surname(row.author);
    const book = candidates.length === 1 ? candidates[0] : candidates.find((b) => surname(b.author) === wanted);
    if (book && (candidates.length === 1 || surname(book.author) === wanted)) matched.push({ row, book });
    else unmatched.push(row);
  }
  return { matched, unmatched };
}

/* ── what an import changes ──────────────────────────────────────────── */

export interface ImportChanges {
  marks: Record<string, BookMark>;
  shelf: ShelfEntry[];
}

/** Folds matched rows into the marks and the shelf. Nothing already written
 *  by hand is overwritten: a book you have rated here keeps your rating, and
 *  the import only fills what is empty. Reading places are never touched —
 *  Goodreads does not know where you are on the page. */
export function applyImport(
  result: ImportResult,
  marks: Record<string, BookMark>,
  shelf: ShelfEntry[],
  now: number,
): ImportChanges {
  const nextMarks: Record<string, BookMark> = { ...marks };
  const nextShelf = [...shelf];

  for (const { row, book } of result.matched) {
    const existing = nextMarks[book.id];
    nextMarks[book.id] = {
      bookId: book.id,
      stars: existing?.stars ?? (row.myRating >= 1 && row.myRating <= 5 ? row.myRating : undefined),
      review: existing?.review ?? row.myReview,
      updatedAt: existing?.updatedAt ?? now,
      imported: {
        from: "goodreads",
        at: now,
        averageRating: row.averageRating,
        shelf: row.shelf,
        dateRead: row.dateRead,
        readCount: row.readCount,
      },
    };

    // "read" and "currently-reading" both belong on the shelf; "to-read"
    // does too — that is what a shelf is for.
    const already = nextShelf.find((e) => e.bookId === book.id);
    const finished = row.shelf === "read";
    if (already) {
      if (finished && !already.finishedAt) already.finishedAt = now;
    } else {
      nextShelf.push({ bookId: book.id, addedAt: now, finishedAt: finished ? now : undefined });
    }
  }

  return { marks: nextMarks, shelf: nextShelf };
}

/* ── letting it out again ────────────────────────────────────────────── */

/** A CSV in the shape Goodreads' own export takes, so it can be handed
 *  straight back to Goodreads' importer — or to anything else that reads
 *  one. Only books you have actually marked or shelved appear. */
export function toGoodreadsCsv(
  marks: Record<string, BookMark>,
  shelf: ShelfEntry[],
  index: CatalogueIndexRow[],
): string {
  const byId = new Map(index.map((b) => [b.id, b]));
  const ids = new Set([...Object.keys(marks), ...shelf.map((e) => e.bookId)]);

  const header = [
    "Title",
    "Author",
    "My Rating",
    "Average Rating",
    "My Review",
    "Exclusive Shelf",
    "Date Read",
    "Date Added",
    "Read Count",
  ];
  const rows: (string | number)[][] = [header];

  const day = (ms?: number) => (ms ? new Date(ms).toISOString().slice(0, 10) : "");

  for (const id of ids) {
    const book = byId.get(id);
    if (!book) continue;
    const mark = marks[id];
    const entry = shelf.find((e) => e.bookId === id);
    const exclusive = entry?.finishedAt ? "read" : entry ? "to-read" : "";
    rows.push([
      book.title,
      book.author,
      mark?.stars ?? 0,
      mark?.imported?.averageRating ?? "",
      mark?.review ?? "",
      exclusive,
      day(entry?.finishedAt) || (mark?.imported?.dateRead ?? ""),
      day(entry?.addedAt),
      mark?.imported?.readCount ?? (entry?.finishedAt ? 1 : ""),
    ]);
  }

  return toCsv(rows);
}
