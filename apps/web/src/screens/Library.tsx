// The library: six hundred books as a bookshop rather than an inventory.
// Shelves with real names — adventure, the mystery cornerstones, Verne's
// voyages — each a sideways drift of book tiles; search and the categories
// collapse everything into one wall.
//
// The old wall dressed each book in one of ten typographic jackets over one
// of five cloths, which meant a row read as a paint chart and three saturated
// fills carried most of it. Now every book wears its own generated plate,
// coloured by the category it belongs to, so the wall has as many marks as it
// has books and the colour means something a reader can learn.
import { useEffect, useMemo, useState } from "react";
import { Room } from "../shell/Shell";
import { useNavigate } from "../router/context";
import { loadIndex, type CatalogueIndexRow } from "../content/catalogue";
import { BookCard } from "../components/BookCard";
import { RecoveryScreen } from "../components/RecoveryScreen";
import "./Library.css";

type Status = "loading" | "ready" | "error";

// The eleven categories the library sorts on, in reading order. Set
// memberships (prize lists, publisher canons) become shelves below rather
// than crowding this row.
const KINDS = [
  "Fiction",
  "Nonfiction",
  "Adventure",
  "Mystery & Horror",
  "Poetry",
  "Philosophy",
  "Drama",
  "Comedy & Satire",
  "Fantasy & Science Fiction",
  "Biography & Memoir",
  "Children's",
] as const;

const PAGE = 60;
const SHELF_PREVIEW = 10;

// Shelves, in walking order: moods first, then the named collections.
// Categories are matched loosely (case and punctuation set aside) because
// the catalogue's own names carry typographic apostrophes.
const SHELVES: { match: string; name: string }[] = [
  { match: "adventure", name: "Adventure" },
  { match: "mystery horror", name: "Mystery & horror" },
  { match: "haycraft queen cornerstones", name: "The mystery cornerstones" },
  { match: "fantasy science fiction", name: "Fantasy & science fiction" },
  { match: "comedy satire", name: "Comedy & satire" },
  { match: "philosophy", name: "Philosophy" },
  { match: "poetry", name: "Poetry" },
  { match: "drama", name: "Drama" },
  { match: "biography memoir", name: "Lives, told" },
  { match: "sherlock holmes", name: "Sherlock Holmes" },
  { match: "voyages extraordinaires", name: "Jules Verne's voyages" },
  { match: "encyclop dia britannica s great books of the western world", name: "The great books" },
  { match: "encyclop dia britannica s gateway to the great books", name: "Gateway to the great books" },
  { match: "the bbc s 100 greatest british novels 2015", name: "The BBC's British hundred" },
  { match: "the guardian s best 100 novels in english 2015", name: "The Guardian's hundred in English" },
  { match: "the guardian s 100 best novels of all time 2026", name: "The Guardian's hundred, 2026" },
  { match: "the guardian s 100 greatest novels of all time 2003", name: "The Guardian's hundred, 2003" },
  { match: "modern library s 100 best novels", name: "Modern Library's hundred" },
  { match: "harvard classics shelf of fiction", name: "The Harvard shelf" },
  { match: "mystery writers of america top 100 mysteries of all time", name: "The American mysteries" },
  { match: "the telegraph s greatest villains in literature", name: "Great villains" },
  { match: "pulitzer prize for fiction winners", name: "Pulitzer winners" },
];

function norm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function Library() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<string | null>(null);
  const [shelf, setShelf] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [rows, setRows] = useState<CatalogueIndexRow[]>([]);
  const [shown, setShown] = useState(PAGE);

  async function load() {
    try {
      setRows(await loadIndex());
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // normalized category -> books, in catalogue order.
  const byCategory = useMemo(() => {
    const map = new Map<string, CatalogueIndexRow[]>();
    for (const row of rows) {
      for (const category of row.categories) {
        const key = norm(category);
        const list = map.get(key);
        if (list) list.push(row);
        else map.set(key, [row]);
      }
    }
    return map;
  }, [rows]);

  const q = query.trim().toLowerCase();
  const browsing = !q && !kind && !shelf && !all;

  const wall = useMemo(() => {
    if (browsing) return [];
    let hits = shelf ? (byCategory.get(shelf) ?? []) : rows;
    if (kind) hits = hits.filter((row) => row.categories.includes(kind));
    if (q) hits = hits.filter((row) => `${row.title} ${row.author}`.toLowerCase().includes(q));
    return hits;
  }, [rows, byCategory, browsing, shelf, kind, q]);

  useEffect(() => setShown(PAGE), [q, kind, shelf, all]);

  if (status === "error") {
    return <RecoveryScreen back={{ to: "/", label: "Shelf" }} onRetry={() => void load()} />;
  }

  const shelfName = shelf ? SHELVES.find((s) => s.match === shelf)?.name : null;

  const tile = (row: CatalogueIndexRow) => (
    <BookCard key={row.id} book={row} onClick={() => navigate(`/book/${row.id}`)} />
  );

  return (
    <Room>
      <div className="room__head">
        <h1 className="mark">The library</h1>
      </div>

      <label className="field">
        <span className="field__sigil" aria-hidden="true">
          /
        </span>
        <span className="sr-only">Title or author</span>
        <input
          type="search"
          placeholder="title or author"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="meta">{browsing ? `${rows.length} books` : `${wall.length}`}</span>
      </label>

      <div className="library__kinds">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className="chip"
            aria-pressed={kind === k}
            onClick={() => {
              setShelf(null);
              setAll(false);
              setKind((current) => (current === k ? null : k));
            }}
          >
            {k}
          </button>
        ))}
      </div>

      {status === "ready" && browsing && (
        <div className="library__shelves">
          {SHELVES.map(({ match, name }) => {
            const books = byCategory.get(match);
            if (!books || books.length === 0) return null;
            return (
              <section key={match} className="library__shelf">
                <button type="button" className="library__shelf-head" onClick={() => setShelf(match)}>
                  <span className="library__shelf-name">{name}</span>
                  <span className="meta">all {books.length} →</span>
                </button>
                <div className="library__row">{books.slice(0, SHELF_PREVIEW).map(tile)}</div>
              </section>
            );
          })}
          <button type="button" className="btn btn--quiet library__everything" onClick={() => setAll(true)}>
            Every book, A to Z · {rows.length}
          </button>
        </div>
      )}

      {status === "ready" && !browsing && (
        <>
          {(shelfName || all) && (
            <div className="library__wall-head">
              <span className="eyebrow">{shelfName ?? "Every book"}</span>
              <button
                type="button"
                className="btn btn--bare"
                onClick={() => {
                  setShelf(null);
                  setAll(false);
                }}
              >
                back to the shelves
              </button>
            </div>
          )}
          <div className="library__grid">{wall.slice(0, shown).map(tile)}</div>
          {wall.length === 0 && <p className="library__empty">No book has that name.</p>}
          {shown < wall.length && (
            <button type="button" className="btn btn--quiet library__more" onClick={() => setShown((n) => n + PAGE)}>
              More
            </button>
          )}
          {wall.length > 0 && (
            <p className="meta library__foot">
              {wall.length} {wall.length === 1 ? "book" : "books"}, all out of copyright.
            </p>
          )}
        </>
      )}
    </Room>
  );
}
