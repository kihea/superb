// The Shelf: what you are reading, what is waiting, what you have read.
//
// The spine ledge was the one thing the audit found genuinely good here, so it
// stays and gets more room: uneven heights, a lean or two, the title running
// down the spine, and a bar of the book's category colour at the foot of each
// so a shelf can be read by colour before it is read by name. What went is the
// flat-fill cover and the flat-fill button that were doing the rest.
import { useEffect, useState } from "react";
import { Room } from "../shell/Shell";
import { Link } from "../router/router";
import { useNavigate } from "../router/context";
import { getAllPlaces, getShelf, type BookPlace, type ShelfEntry } from "../reading/bookState";
import { getBook, getIndexRow, type CatalogueIndexRow } from "../content/catalogue";
import { Plate } from "../components/Plate";
import { useLive } from "../components/useLive";
import { genreOf } from "../content/genre";
import { hash, kindHue } from "../design/plate";
import "./Shelf.css";

/** A book standing on the ledge, seen from its spine. The same book always
 *  stands the same way — height and lean come off its own id. */
function Spine({ row, finished, onClick }: { row: CatalogueIndexRow; finished?: boolean; onClick: () => void }) {
  const h = hash(row.id + "spine");
  const height = 132 + (h % 46); // 132–177px: real shelves are uneven
  const lean = ((h >> 4) % 5) - 2; // −2°…2°: a few books rest tilted
  return (
    <button
      type="button"
      className={`spine${finished ? " spine--read" : ""}`}
      style={{ height: `${height}px`, transform: lean ? `rotate(${lean * 0.6}deg)` : undefined }}
      onClick={onClick}
      title={`${row.title} · ${row.author}`}
    >
      <span className="spine__title">{row.title}</span>
      {!finished && (
        <span className="spine__band" aria-hidden="true" style={{ background: kindHue(genreOf(row)) }} />
      )}
    </button>
  );
}

/** "IV" and "12" become "Chapter IV" / "Chapter 12"; a label with its own
 *  words ("Canto the First") stands as written; an edition that left the
 *  chapter unlabelled gets a plain answer instead of a crash. */
function placeName(label: string | null | undefined): string {
  if (!label || !label.trim()) return "Your place";
  return /^[IVXLC0-9]+$/i.test(label.trim()) ? `Chapter ${label}` : label;
}

interface ShelfBook {
  row: CatalogueIndexRow;
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

  // Index rows only: the shelf needs a title, an author and a category, and
  // fetching every book's whole text to draw a spine was always wasteful.
  for (const entry of entries) {
    const row = await getIndexRow(entry.bookId).catch(() => undefined);
    if (row) byId.set(entry.bookId, { row, entry });
  }
  for (const place of places) {
    const known = byId.get(place.bookId);
    if (known) {
      known.place = place;
      continue;
    }
    const row = await getIndexRow(place.bookId).catch(() => undefined);
    if (row) byId.set(place.bookId, { row, place });
  }

  const all = [...byId.values()];
  const read = all.filter((b) => b.entry?.finishedAt);
  const unread = all.filter((b) => !b.entry?.finishedAt);
  // The current book is the one most recently read in; opening a book you
  // just added also counts, through its place write on first open.
  const current =
    unread.sort(
      (a, b) => (b.place?.updatedAt ?? b.entry?.addedAt ?? 0) - (a.place?.updatedAt ?? a.entry?.addedAt ?? 0),
    )[0] ?? null;
  const waiting = unread.filter((b) => b !== current);
  return { current, waiting, read };
}

/** Where the reader is, said as a place and a proportion rather than a
 *  percentage badge: "Chapter IV · about four hours left". */
function useWhere(current: ShelfBook | null) {
  const [label, setLabel] = useState<string | null>(null);
  const [through, setThrough] = useState(0);

  useEffect(() => {
    let live = true;
    if (!current) {
      setLabel(null);
      setThrough(0);
      return;
    }
    if (!current.place) {
      setLabel("Just opened");
      setThrough(0);
      return;
    }
    getBook(current.row.id)
      .then((book) => {
        if (!live || !book) return;
        const part = book.parts[current.place!.partIndex];
        setLabel(placeName(part?.label));
        setThrough(book.parts.length ? current.place!.partIndex / book.parts.length : 0);
      })
      .catch(() => {
        if (live) setLabel("Your place");
      });
    return () => {
      live = false;
    };
  }, [current]);

  return { label, through };
}

export function Shelf() {
  const navigate = useNavigate();
  const [data, setData] = useState<ShelfData | null>(null);
  const { live, liveProps } = useLive();

  useEffect(() => {
    loadShelfData()
      .then((loaded) => {
        // The very first open goes to the welcome instead of an empty room.
        // After that, an empty shelf is just an empty shelf.
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

  const current = data?.current ?? null;
  const where = useWhere(current);

  if (!data) return <Room />;

  const empty = !data.current && data.waiting.length === 0 && data.read.length === 0;

  if (empty) {
    return (
      <Room width="narrow">
        <div className="room__head">
          <h1 className="mark">Your shelf</h1>
        </div>
        <p className="shelf__first">Your shelf is empty. Put a book on it.</p>
        <div className="shelf__first-doors">
          <button type="button" className="btn" onClick={() => navigate("/library")}>
            Find a book
          </button>
          <Link to="/play" className="btn btn--quiet">
            or go to Play
          </Link>
        </div>
      </Room>
    );
  }

  const counted = [
    current ? "1 open" : null,
    data.waiting.length ? `${data.waiting.length} waiting` : null,
    data.read.length ? `${data.read.length} read` : null,
  ].filter(Boolean);

  return (
    <Room>
      <div className="room__head">
        <h1 className="mark">Your shelf</h1>
        <span className="eyebrow">{counted.join(" · ")}</span>
      </div>

      {current && (
        <div className="shelf__current enter" {...liveProps}>
          <Plate
            seed={current.row.title}
            kind={genreOf(current.row)}
            cols={32}
            rows={15}
            size={10}
            live={live}
            className="shelf__current-plate"
          />
          <div className="shelf__current-side">
            <span className="eyebrow">You are reading</span>
            <h2 className="shelf__current-title mark">{current.row.title}</h2>
            <span className="meta">{current.row.author}</span>
            <div className="shelf__progress">
              <div className="shelf__progress-said">
                <span>{where.label ?? "…"}</span>
                <span>{Math.round(where.through * 100)}% through</span>
              </div>
              <div className="shelf__progress-track">
                <div
                  className="shelf__progress-fill"
                  style={{
                    width: `${Math.max(1, Math.round(where.through * 100))}%`,
                    background: kindHue(genreOf(current.row)),
                  }}
                />
              </div>
            </div>
            <div className="shelf__current-doors">
              <button type="button" className="btn" onClick={() => navigate(`/book/${current.row.id}/read`)}>
                Keep reading →
              </button>
              <button type="button" className="btn btn--quiet" onClick={() => navigate(`/book/${current.row.id}`)}>
                About this book
              </button>
            </div>
          </div>
        </div>
      )}

      {data.waiting.length > 0 && (
        <section className="shelf__section">
          <span className="eyebrow">Waiting</span>
          <div className="shelf__ledge">
            {data.waiting.map(({ row }) => (
              <Spine key={row.id} row={row} onClick={() => navigate(`/book/${row.id}`)} />
            ))}
          </div>
        </section>
      )}

      {data.read.length > 0 && (
        <section className="shelf__section">
          <span className="eyebrow">Read</span>
          <div className="shelf__ledge shelf__ledge--read">
            {data.read.map(({ row }) => (
              <Spine key={row.id} row={row} finished onClick={() => navigate(`/book/${row.id}`)} />
            ))}
          </div>
        </section>
      )}

      <Link to="/library" className="btn btn--bare shelf__find">
        Find another
      </Link>
    </Room>
  );
}
