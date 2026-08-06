// One book, before you start.
//
// The audit's verdict on the old version was that it could have been any
// product's detail page: a centred thumbnail, a title, a meta line and a
// primary button. Nothing on it told you this was Dracula rather than a
// kettle. This one says what the book is — the publisher's own description,
// the categories it belongs to, what it costs you in hours, the line it opens
// with — and then what you thought of it.
//
// Ratings and reviews here are yours and nobody else's, because there is no
// server to hold anybody else's. What a Goodreads export brings in is yours
// too; the one number that is not is Goodreads' community average, which is
// labelled as theirs wherever it appears.
import { useEffect, useState } from "react";
import { Room } from "../shell/Shell";
import { Link } from "../router/router";
import { useNavigate } from "../router/context";
import { getDescription, getIndexRow, type CatalogueIndexRow } from "../content/catalogue";
import { addToShelf, getShelf } from "../reading/bookState";
import { getMark, setMark, type BookMark } from "../reading/marks";
import { Plate } from "../components/Plate";
import { useLive } from "../components/useLive";
import { genreOf } from "../content/genre";
import { kindHue } from "../design/plate";
import { Stars, StarPicker } from "../components/Stars";
import { RecoveryScreen } from "../components/RecoveryScreen";
import { NotFound } from "./NotFound";
import "./BookCover.css";

type Status = "loading" | "ready" | "not-found" | "error";

/** Roughly 13,000 words an hour is an unhurried reading pace, which is the
 *  only pace this app has any business assuming. */
function hoursFor(words: number): string {
  const hours = words / 13000;
  if (hours < 1) return "under an hour";
  const rounded = Math.round(hours);
  return `about ${rounded} ${rounded === 1 ? "hour" : "hours"}`;
}

function thousands(words: number): string {
  return words >= 1000 ? `${Math.round(words / 1000)}k words` : `${words} words`;
}

export function BookCover({ id }: { id: string }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("loading");
  const [row, setRow] = useState<CatalogueIndexRow | null>(null);
  const [description, setDescription] = useState<string[]>([]);
  const [mark, setMarkState] = useState<BookMark | null>(null);
  const [onShelf, setOnShelf] = useState(false);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState("");
  const { live, liveProps } = useLive();

  async function load() {
    setStatus("loading");
    try {
      const found = await getIndexRow(id);
      if (!found) {
        setStatus("not-found");
        return;
      }
      setRow(found);
      setStatus("ready");
      // The rest arrives when it arrives; none of it should hold the page.
      void getDescription(id).then(setDescription);
      void getMark(id).then((m) => {
        setMarkState(m);
        setDraft(m?.review ?? "");
      });
      void getShelf().then((shelf) => setOnShelf(shelf.some((e) => e.bookId === id)));
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (status === "loading") {
    return (
      <Room width="page">
        <p className="meta">Finding this book.</p>
      </Room>
    );
  }
  if (status === "not-found") return <NotFound />;
  if (status === "error") {
    return <RecoveryScreen back={{ to: "/library", label: "Library" }} onRetry={() => void load()} />;
  }
  if (!row) return <NotFound />;

  const book = row;
  const genre = genreOf(book);
  const sets = book.categories.slice(1);

  function begin() {
    void addToShelf(book.id, Date.now()).catch(() => {});
    navigate(`/book/${book.id}/read`);
  }

  function addForLater() {
    void addToShelf(book.id, Date.now()).catch(() => {});
    setOnShelf(true);
  }

  function rate(stars: number | undefined) {
    void setMark(book.id, { stars }).then(setMarkState);
  }

  function saveReview() {
    void setMark(book.id, { review: draft }).then((next) => {
      setMarkState(next);
      setWriting(false);
    });
  }

  const imported = mark?.imported;

  return (
    <Room width="page">
      <Link to="/library" className="btn btn--bare book__back">
        ← library
      </Link>

      <div className="book__head" {...liveProps}>
        <Plate seed={book.title} kind={genre} cols={34} rows={16} size={10.5} live={live} className="book__plate" />
        <div className="book__names">
          <h1 className="mark book__title">{book.title}</h1>
          <span className="book__author">
            {book.author}
            {book.translator ? ` · translated by ${book.translator}` : ""}
          </span>

          <div className="book__facts">
            <span>
              {book.chapterCount} {book.chapterCount === 1 ? "chapter" : "chapters"}
            </span>
            <span>{thousands(book.wordCount)}</span>
            <span>{hoursFor(book.wordCount)}</span>
            {genre && <span style={{ color: kindHue(genre) }}>{genre}</span>}
          </div>

          <div className="book__doors">
            <button type="button" className="btn" onClick={begin}>
              {onShelf ? "Keep reading" : "Begin"}
            </button>
            <button type="button" className="btn btn--quiet" onClick={addForLater} disabled={onShelf}>
              {onShelf ? "On your shelf" : "Add to shelf"}
            </button>
          </div>
        </div>
      </div>

      {sets.length > 0 && (
        <section className="book__section">
          <span className="eyebrow">Also in</span>
          <div className="book__sets">
            {sets.map((set) => (
              <span key={set} className="chip book__set">
                {set}
              </span>
            ))}
          </div>
        </section>
      )}

      {description.length > 0 && (
        <section className="book__section">
          <span className="eyebrow">What it is</span>
          <div className="book__description">
            {description.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
          <span className="meta book__credit">Standard Ebooks wrote this description and gave it to the public domain.</span>
        </section>
      )}

      {book.firstLine && (
        <section className="book__section">
          <span className="eyebrow">It begins</span>
          <p className="book__opening">{book.firstLine}</p>
        </section>
      )}

      <section className="book__section book__marks">
        <div className="book__marks-head">
          <span className="eyebrow">Your review</span>
          {imported && (
            <span className="meta">imported from Goodreads {new Date(imported.at).toLocaleDateString()}</span>
          )}
        </div>

        <div className="book__rating">
          <StarPicker value={mark?.stars} onChange={rate} label={`Your rating of ${book.title}`} />
          <span className="meta">{mark?.stars ? "your rating" : "not rated yet"}</span>
        </div>

        {imported?.averageRating && (
          <div className="book__elsewhere">
            <Stars value={imported.averageRating} />
            <span className="meta">
              {imported.averageRating.toFixed(2)} on Goodreads, as your export recorded it
            </span>
          </div>
        )}

        {writing ? (
          <div className="book__write">
            <label className="sr-only" htmlFor="review">
              Your review
            </label>
            <textarea
              id="review"
              className="book__review-field"
              rows={5}
              value={draft}
              placeholder="What did you think of it?"
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="book__write-doors">
              <button type="button" className="btn btn--small" onClick={saveReview}>
                Save
              </button>
              <button
                type="button"
                className="btn btn--small btn--quiet"
                onClick={() => {
                  setDraft(mark?.review ?? "");
                  setWriting(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : mark?.review ? (
          <blockquote className="book__review">
            <p>{mark.review}</p>
            <button type="button" className="btn btn--bare" onClick={() => setWriting(true)}>
              edit
            </button>
          </blockquote>
        ) : (
          <button type="button" className="btn btn--quiet btn--small book__write-open" onClick={() => setWriting(true)}>
            Write a review
          </button>
        )}

        {!imported && (
          <p className="meta book__bring">
            Read elsewhere?{" "}
            <Link to="/settings" className="book__link">
              Import your ratings and reviews from Goodreads
            </Link>
            .
          </p>
        )}
      </section>

      <p className="meta book__licence">Out of copyright: free to read, keep, and pass on.</p>
    </Room>
  );
}
