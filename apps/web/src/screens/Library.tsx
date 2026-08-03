// The library: six hundred books as a bookshop rather than an inventory.
// Shelves with real names — adventure, the mystery cornerstones, Verne's
// voyages — each a sideways drift of typeset jackets; search and the four
// kinds collapse everything into one wall of jackets. A book is its title
// set in one of ten jacket styles with the author beneath: no chapter
// counts, no translator lines, nothing a bookshop window wouldn't say.
import { useEffect, useMemo, useState } from "react";
import { Screen } from "../shell/Screen";
import { useNavigate } from "../router/context";
import { loadIndex, type CatalogueIndexRow } from "../content/catalogue";
import { Jacket, jacketFor } from "../components/Jacket";
import { clothFor } from "./Shelf";
import { RecoveryScreen } from "../components/RecoveryScreen";
import "./Library.css";

type Status = "loading" | "ready" | "error";

// The library's own top-level kinds, in reading order. Collections
// ("Also in" lists) become shelves below instead of crowding the chips.
const KINDS = ["Fiction", "Nonfiction", "Poetry", "Drama"] as const;

const PAGE = 60;
const SHELF_PREVIEW = 12;

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
  { match: "the guardian s 100 greatest novels of all time 2003", name: "The Guardian's hundred" },
  { match: "modern library s 100 best novels", name: "Modern Library's hundred" },
  { match: "harvard classics shelf of fiction", name: "The Harvard shelf" },
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

  function jacketOf(row: CatalogueIndexRow) {
    return (
      <Jacket
        key={row.id}
        book={{ title: row.title, author: row.author, cloth: clothFor(row.id) }}
        styleIndex={jacketFor(row.id)}
        onClick={() => navigate(`/book/${row.id}`)}
      />
    );
  }

  return (
    <Screen title="Library" sunken>
      <label className="library-search">
        <span className="sr-only">Title or author</span>
        <input
          className="library-search__field"
          type="search"
          placeholder="Title or author"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      <div className="library-kinds">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className={`sb-tier${kind === k ? " sb-tier--on" : ""}`}
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
        <div className="library-shelves">
          {SHELVES.map(({ match, name }) => {
            const books = byCategory.get(match);
            if (!books || books.length === 0) return null;
            return (
              <section key={match} className="library-shelf">
                <button
                  type="button"
                  className="library-shelf__head"
                  onClick={() => setShelf(match)}
                >
                  <span className="library-shelf__name">{name}</span>
                  <span className="library-shelf__count">
                    all {books.length} →
                  </span>
                </button>
                <div className="library-shelf__row">
                  {books.slice(0, SHELF_PREVIEW).map(jacketOf)}
                </div>
              </section>
            );
          })}
          <button
            type="button"
            className="sb-button sb-button--secondary"
            onClick={() => setAll(true)}
          >
            Every book, A to Z · {rows.length}
          </button>
        </div>
      )}

      {status === "ready" && !browsing && (
        <>
          {(shelfName || all) && (
            <div className="library-wall__head">
              <span className="sb-eyebrow">{shelfName ?? "Every book"}</span>
              <button
                type="button"
                className="sb-quiet"
                onClick={() => {
                  setShelf(null);
                  setAll(false);
                }}
              >
                back to the shelves
              </button>
            </div>
          )}
          <div className="library-grid">{wall.slice(0, shown).map(jacketOf)}</div>
          {wall.length === 0 && <p className="sb-said">Nothing here by that name.</p>}
          {shown < wall.length && (
            <button
              type="button"
              className="sb-quiet sb-quiet--centred"
              onClick={() => setShown((n) => n + PAGE)}
            >
              More
            </button>
          )}
          <p className="sb-caption">
            {wall.length > 0
              ? `${wall.length} ${wall.length === 1 ? "book" : "books"}, all out of copyright.`
              : " "}
          </p>
        </>
      )}
    </Screen>
  );
}
