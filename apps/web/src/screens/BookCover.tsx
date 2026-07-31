// Screen 5, from frame 2h: the cover sits on a paper panel with the brand
// wash behind it, and the first line of the book is already on the page --
// you can tell whether you want it before you begin.
import { Screen } from "../shell/Screen";
import { useNavigate } from "../router/context";
import { bookById } from "../v0mock";
import { Cover } from "../components/Cover";
import { NotFound } from "./NotFound";
import "./BookCover.css";

export function BookCover({ id }: { id: string }) {
  const navigate = useNavigate();
  const book = bookById(id);
  if (!book) return <NotFound />;

  return (
    <Screen back={{ to: "/library", label: "Library" }}>
      <div className="book-wash" aria-hidden="true" />

      <div className="book-head">
        <Cover book={book} size="xl" />
        <div className="book-head__facts">
          <span className="sb-eyebrow">{book.parts}</span>
          {book.translator && <span className="sb-caption">translated by {book.translator}</span>}
        </div>
      </div>

      <div className="book-names">
        <h2 className="sb-heading">{book.title}</h2>
        <span className="sb-said">
          {book.author}
          {book.translator ? ` · translated by ${book.translator}` : ""}
        </span>
      </div>

      <p className="sb-passage">{book.blurb}</p>

      <div className="sb-card book-opening">
        <span className="sb-eyebrow">It begins</span>
        <p className="book-opening__line">“{book.opening}”</p>
      </div>

      <div className="book-actions">
        <button
          type="button"
          className="sb-button sb-button--wide"
          onClick={() => navigate(`/book/${book.id}/read`)}
        >
          Begin
        </button>
        <button type="button" className="sb-quiet sb-quiet--centred" onClick={() => navigate("/shelf")}>
          Add to shelf
        </button>
      </div>
    </Screen>
  );
}
