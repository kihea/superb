// The Shelf: laid paper, no furniture, covers as objects with weight and
// the current one large. Finished books frost over rather than fade.
// Progress here is an artifact -- books and places -- never a number.
import { useEffect, useState } from "react";
import { Screen } from "../shell/Screen";
import { Link } from "../router/router";
import { useNavigate } from "../router/context";
import { getAllPlaces, getShelf, type BookPlace, type ShelfEntry } from "../reading/bookState";
import { getBook } from "../content/catalogue";
import type { CatalogueBook } from "../content/catalogueTypes";
import { Cover, type CoverBook } from "../components/Cover";
import "./Shelf.css";

const CLOTHS: CoverBook["cloth"][] = ["brand", "ink", "support", "soft", "paper"];

/** The same book always wears the same cloth. */
export function clothFor(id: string): CoverBook["cloth"] {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return CLOTHS[hash % CLOTHS.length];
}

/** "IV" and "12" become "Chapter IV" / "Chapter 12"; a label with its own
 *  words ("Canto the First") stands as written. */
function placeName(label: string): string {
  return /^[IVXLC0-9]+$/i.test(label.trim()) ? `Chapter ${label}` : label;
}

interface ShelfBook {
  book: CatalogueBook;
  entry?: ShelfEntry;
  place?: BookPlace;
}

interface ShelfData {
  current: ShelfBook | null;
  waiting: ShelfBook[];
  read: ShelfBook[];
}

async function loadShelfData(): Promise<ShelfData> {
  const [entries, places] = await Promise.all([getShelf(), getAllPlaces()]);
  const byId = new Map<string, ShelfBook>();

  for (const entry of entries) {
    const book = await getBook(entry.bookId).catch(() => undefined);
    if (book) byId.set(entry.bookId, { book, entry });
  }
  for (const place of places) {
    const known = byId.get(place.bookId);
    if (known) {
      known.place = place;
      continue;
    }
    const book = await getBook(place.bookId).catch(() => undefined);
    if (book) byId.set(place.bookId, { book, place });
  }

  const all = [...byId.values()];
  const read = all.filter((b) => b.entry?.finishedAt);
  const unread = all.filter((b) => !b.entry?.finishedAt);
  // The current book is the one most recently read in; opening a book you
  // just added also counts, through its place write on first open.
  const current =
    unread.sort((a, b) => (b.place?.updatedAt ?? b.entry?.addedAt ?? 0) - (a.place?.updatedAt ?? a.entry?.addedAt ?? 0))[0] ??
    null;
  const waiting = unread.filter((b) => b !== current);
  return { current, waiting, read };
}

export function Shelf() {
  const navigate = useNavigate();
  const [data, setData] = useState<ShelfData | null>(null);

  useEffect(() => {
    loadShelfData()
      .then(setData)
      .catch(() => setData({ current: null, waiting: [], read: [] }));
  }, []);

  if (!data) {
    return <Screen title="Shelf" sunken tabs>{null}</Screen>;
  }

  const empty = !data.current && data.waiting.length === 0 && data.read.length === 0;

  if (empty) {
    return (
      <Screen title="Shelf" sunken tabs>
        <div className="shelf-first sb-rise">
          <p className="sb-said">Your shelf is empty, which is the best kind of problem.</p>
          <button type="button" className="sb-button sb-button--wide" onClick={() => navigate("/library")}>
            Find a book
          </button>
          <Link to="/play" className="sb-quiet sb-quiet--centred">
            or start with a game
          </Link>
        </div>
      </Screen>
    );
  }

  const current = data.current;
  const currentPart = current?.place ? current.book.parts[current.place.partIndex] : undefined;

  return (
    <Screen title="Shelf" sunken tabs>
      {current && (
        <div className="shelf-current sb-rise">
          <Cover
            book={{ title: current.book.title, author: current.book.author, cloth: clothFor(current.book.id) }}
            size="lg"
            onClick={() => navigate(`/book/${current.book.id}`)}
          />
          <div className="shelf-current__side">
            <div className="shelf-current__where">
              <span className="shelf-current__part">
                {currentPart ? placeName(currentPart.label) : "Just opened"}
              </span>
              <span className="sb-caption">{current.book.author}</span>
            </div>
            <button
              type="button"
              className="sb-button sb-button--sm"
              onClick={() => navigate(`/book/${current.book.id}/read`)}
            >
              Keep reading
            </button>
          </div>
        </div>
      )}

      {data.waiting.length > 0 && (
        <div className="shelf-grid">
          {data.waiting.map(({ book }) => (
            <Cover
              key={book.id}
              book={{ title: book.title, author: book.author, cloth: clothFor(book.id) }}
              onClick={() => navigate(`/book/${book.id}`)}
            />
          ))}
        </div>
      )}

      {data.read.length > 0 && (
        <div className="shelf-section">
          <span className="sb-eyebrow">Read</span>
          <div className="shelf-grid shelf-grid--read">
            {data.read.map(({ book }) => (
              <Cover
                key={book.id}
                book={{ title: book.title, author: book.author, cloth: clothFor(book.id) }}
                finished
                onClick={() => navigate(`/book/${book.id}`)}
              />
            ))}
          </div>
        </div>
      )}

      <Link to="/library" className="sb-quiet sb-quiet--centred">
        Find another
      </Link>
    </Screen>
  );
}
