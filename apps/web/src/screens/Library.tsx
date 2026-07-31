// Screen 4, from frame 2g: the library as cards you could pick up, on 1h's
// material, keeping 1i's structure -- search, a row of moods, then the
// books themselves.
import { useState } from "react";
import { Screen } from "../shell/Screen";
import { useNavigate } from "../router/context";
import { books, libraryMoods } from "../v0mock";
import { Cover } from "../components/Cover";
import "./Library.css";

export function Library() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [mood, setMood] = useState<string | null>(null);

  const shown = books.filter((book) => {
    const words = `${book.title} ${book.author}`.toLowerCase();
    if (query && !words.includes(query.toLowerCase())) return false;
    if (mood && !book.moods.includes(mood.toLowerCase())) return false;
    return true;
  });

  return (
    <Screen title="Library" back={{ to: "/shelf", label: "Shelf" }} sunken tabs>
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

      <div className="library-moods">
        {libraryMoods.map((name) => (
          <button
            key={name}
            type="button"
            className={`library-mood${mood === name ? " library-mood--on" : ""}`}
            onClick={() => setMood((current) => (current === name ? null : name))}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="library-list">
        {shown.map((book) => (
          <button
            key={book.id}
            type="button"
            className="library-book"
            onClick={() => navigate(`/book/${book.id}`)}
          >
            <Cover book={book} size="sm" />
            <span className="library-book__side">
              <span className="library-book__names">
                <span className="library-book__title">{book.title}</span>
                <span className="sb-caption">
                  {book.author} · {book.parts}
                </span>
              </span>
              <span className="library-book__blurb">{book.blurb}</span>
            </span>
          </button>
        ))}
        {shown.length === 0 && <p className="sb-said">Nothing here by that name.</p>}
      </div>

      {/* His frame reads "612 books, all out of copyright". The count is
          left off until the catalogue is actually wired to this screen --
          a number the app cannot stand behind is worse than no number. */}
      <p className="sb-caption">Every book here is out of copyright.</p>
    </Screen>
  );
}
