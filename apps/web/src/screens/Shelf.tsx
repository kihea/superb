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

/** A book standing on the ledge, seen from its spine: cloth, a height and
 *  a lean of its own, the title running down the cloth. The same book
 *  always stands the same way. */
function Spine({
  book,
  finished,
  onClick,
}: {
  book: CatalogueBook;
  finished?: boolean;
  onClick: () => void;
}) {
  let hash = 0;
  for (const ch of book.id) hash = (hash * 41 + ch.charCodeAt(0)) >>> 0;
  const height = 128 + (hash % 44); // 128–171px: real shelves are uneven
  const lean = ((hash >> 4) % 5) - 2; // −2°…2°: a few books rest tilted
  return (
    <button
      type="button"
      className={`shelf-spine sb-cover--${clothFor(book.id)}${finished ? " shelf-spine--read" : ""}`}
      style={{ height: `${height}px`, transform: lean ? `rotate(${lean * 0.7}deg)` : undefined }}
      onClick={onClick}
    >
      <span className="shelf-spine__title">{book.title}</span>
    </button>
  );
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
      .then((loaded) => {
        // The very first open goes to the welcome instead of an empty
        // room. After that, an empty shelf is just an empty shelf.
        let welcomed = "1";
        try {
          welcomed = window.localStorage.getItem("superb.welcomed") ?? "";
        } catch {
          // Private browsing: skip the redirect rather than loop.
        }
        if (!welcomed && !loaded.current && loaded.waiting.length === 0 && loaded.read.length === 0) {
          navigate("/welcome");
          return;
        }
        setData(loaded);
      })
      .catch(() => setData({ current: null, waiting: [], read: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) {
    return <Screen title="Shelf" sunken>{null}</Screen>;
  }

  const empty = !data.current && data.waiting.length === 0 && data.read.length === 0;

  if (empty) {
    return (
      <Screen title="Shelf" sunken>
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
    <Screen title="Shelf" sunken>
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
        <div className="shelf-section">
          <span className="sb-eyebrow">Waiting</span>
          {/* The waiting books stand on a ledge, spines out, each with its
              own height and lean — a shelf, not a storefront. The library
              is where books face outward; here they just live. */}
          <div className="shelf-ledge">
            {data.waiting.map(({ book }) => (
              <Spine key={book.id} book={book} onClick={() => navigate(`/book/${book.id}`)} />
            ))}
          </div>
        </div>
      )}

      {data.read.length > 0 && (
        <div className="shelf-section">
          <span className="sb-eyebrow">Read</span>
          <div className="shelf-ledge shelf-ledge--read">
            {data.read.map(({ book }) => (
              <Spine
                key={book.id}
                book={book}
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
