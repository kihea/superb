// The library: six hundred books reached by kind first, search second.
// Cards you could pick up, on the sunken paper.
import { useEffect, useMemo, useState } from "react";
import { Screen } from "../shell/Screen";
import { useNavigate } from "../router/context";
import { searchBooks, type CatalogueIndexRow } from "../content/catalogue";
import { Cover } from "../components/Cover";
import { clothFor } from "./Shelf";
import { RecoveryScreen } from "../components/RecoveryScreen";
import "./Library.css";

type Status = "loading" | "ready" | "error";

// The library's own top-level kinds, in reading order. Collections
// ("Also in" lists) stay searchable but don't crowd the chip row.
const KINDS = ["Fiction", "Nonfiction", "Poetry", "Drama"] as const;

const PAGE = 60;

export function Library() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [rows, setRows] = useState<CatalogueIndexRow[]>([]);
  const [shown, setShown] = useState(PAGE);

  async function load(q: string, k: string | null) {
    try {
      const found = await searchBooks(q, k ?? undefined);
      setRows(found);
      setShown(PAGE);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    // A short debounce -- the search is a local filter over the loaded
    // index, so this is about not thrashing state on every keystroke.
    const timer = window.setTimeout(() => void load(query, kind), 120);
    return () => window.clearTimeout(timer);
  }, [query, kind]);

  const total = useMemo(() => rows.length, [rows]);

  if (status === "error") {
    return <RecoveryScreen back={{ to: "/", label: "Shelf" }} onRetry={() => void load(query, kind)} />;
  }

  return (
    <Screen title="Library" back={{ to: "/", label: "Shelf" }} sunken tabs>
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
            onClick={() => setKind((current) => (current === k ? null : k))}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="library-list">
        {status === "ready" &&
          rows.slice(0, shown).map((book) => (
            <button
              key={book.id}
              type="button"
              className="library-book"
              onClick={() => navigate(`/book/${book.id}`)}
            >
              <Cover book={{ title: book.title, author: book.author, cloth: clothFor(book.id) }} size="sm" />
              <span className="library-book__side">
                <span className="library-book__names">
                  <span className="library-book__title">{book.title}</span>
                  <span className="sb-caption">
                    {book.author}
                    {book.translator ? ` · translated by ${book.translator}` : ""}
                    {" · "}
                    {book.chapterCount} {book.chapterCount === 1 ? "chapter" : "chapters"}
                  </span>
                </span>
              </span>
            </button>
          ))}
        {status === "ready" && rows.length === 0 && <p className="sb-said">Nothing here by that name.</p>}
      </div>

      {status === "ready" && shown < total && (
        <button
          type="button"
          className="sb-quiet sb-quiet--centred"
          onClick={() => setShown((n) => n + PAGE)}
        >
          More
        </button>
      )}

      <p className="sb-caption">
        {total > 0 ? `${total} ${total === 1 ? "book" : "books"}, all out of copyright.` : " "}
      </p>
    </Screen>
  );
}
