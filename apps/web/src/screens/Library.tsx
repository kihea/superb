// Screen 4, from frame 2g: the library as cards you could pick up, on 1h's
// material, keeping 1i's structure -- search, then the books themselves.
// Slice 1A (PLAN.md §7) replaces v0mock's hand-written book list with a
// search over the real catalogue artifact (content/catalogue.lock.json).
// That artifact carries one book today (Dracula) -- see the lock file's own
// note and the Slice 1A PR for why, and PLAN.md's non-goals for why the
// mood row from the original frame is gone rather than left showing on
// invented data: moods are a real recommendation feature this slice does
// not build, not a UI treatment to fake with nothing behind it.
import { useEffect, useState } from "react";
import { Screen } from "../shell/Screen";
import { useNavigate } from "../router/context";
import { searchBooks } from "../content/catalogue";
import type { CatalogueBook } from "../content/catalogueTypes";
import { Cover } from "../components/Cover";
import { RecoveryScreen } from "../components/RecoveryScreen";
import "./Library.css";

type Status = "loading" | "ready" | "error";

export function Library() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("loading");
  const [books, setBooks] = useState<CatalogueBook[]>([]);

  async function load(q: string) {
    setStatus("loading");
    try {
      const found = await searchBooks(q);
      setBooks(found);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    // A short debounce -- searchBooks() is a local, already-loaded-artifact
    // filter (content/catalogue.ts caches the fetch), so this is about not
    // thrashing state on every keystroke rather than protecting a network
    // call.
    const timer = window.setTimeout(() => void load(query), 120);
    return () => window.clearTimeout(timer);
  }, [query]);

  if (status === "error") {
    return <RecoveryScreen back={{ to: "/", label: "Reading" }} onRetry={() => void load(query)} />;
  }

  return (
    <Screen title="Library" back={{ to: "/", label: "Reading" }} sunken tabs>
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

      <div className="library-list">
        {status === "ready" &&
          books.map((book) => (
            <button
              key={book.id}
              type="button"
              className="library-book"
              onClick={() => navigate(`/book/${book.id}`)}
            >
              <Cover book={{ title: book.title, author: book.author, cloth: "ink" }} size="sm" />
              <span className="library-book__side">
                <span className="library-book__names">
                  <span className="library-book__title">{book.title}</span>
                  <span className="sb-caption">
                    {book.author}
                    {book.translator ? ` · translated by ${book.translator}` : ""}
                  </span>
                </span>
              </span>
            </button>
          ))}
        {status === "ready" && books.length === 0 && <p className="sb-said">Nothing here by that name.</p>}
      </div>

      <p className="sb-caption">Every book here is out of copyright.</p>
    </Screen>
  );
}
