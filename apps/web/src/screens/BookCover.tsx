// Screen 5, from frame 2h: the cover sits on a paper panel with the brand
// wash behind it, and the first line of the book is already on the page --
// you can tell whether you want it before you begin. Slice 1A (PLAN.md §7)
// sources this from the real catalogue artifact instead of v0mock.
import { useEffect, useState } from "react";
import { Screen } from "../shell/Screen";
import { useNavigate } from "../router/context";
import { getBook } from "../content/catalogue";
import type { CatalogueBook } from "../content/catalogueTypes";
import { Cover } from "../components/Cover";
import { RecoveryScreen } from "../components/RecoveryScreen";
import { NotFound } from "./NotFound";
import "./BookCover.css";

type Status = "loading" | "ready" | "not-found" | "error";

/** The book's own first line, as tappable prose already gives it -- the
 *  first block of its first part, whatever kind of block that is (a diary
 *  dateline, a letter's opening line; catalogueTypes.ts's own note on why
 *  Slice 1A does not distinguish them yet). */
function openingLine(book: CatalogueBook): string {
  return book.parts[0]?.blocks[0]?.text ?? "";
}

export function BookCover({ id }: { id: string }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("loading");
  const [book, setBook] = useState<CatalogueBook | null>(null);

  async function load() {
    setStatus("loading");
    try {
      const found = await getBook(id);
      if (!found) {
        setStatus("not-found");
        return;
      }
      setBook(found);
      setStatus("ready");
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
      <Screen back={{ to: "/library", label: "Library" }}>
        <p className="reading-status">Finding this book.</p>
      </Screen>
    );
  }
  if (status === "not-found") return <NotFound />;
  if (status === "error") {
    return <RecoveryScreen back={{ to: "/library", label: "Library" }} onRetry={() => void load()} />;
  }
  if (!book) return <NotFound />;

  return (
    <Screen back={{ to: "/library", label: "Library" }}>
      <div className="book-wash" aria-hidden="true" />

      <div className="book-head">
        <Cover book={{ title: book.title, author: book.author, cloth: "ink" }} size="xl" />
        <div className="book-head__facts">
          <span className="sb-eyebrow">
            {book.parts.length} {book.parts.length === 1 ? "chapter" : "chapters"}
          </span>
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

      <div className="sb-card book-opening">
        <span className="sb-eyebrow">It begins</span>
        <p className="book-opening__line">“{openingLine(book)}”</p>
      </div>

      <p className="sb-caption">
        {book.provenance.publisher}, from{" "}
        <a href={book.provenance.workPage} target="_blank" rel="noreferrer">
          its own public page
        </a>{" "}
        · {book.provenance.licence}
      </p>

      <div className="book-actions">
        <button type="button" className="sb-button sb-button--wide" onClick={() => navigate(`/book/${book.id}/read`)}>
          Begin
        </button>
      </div>
    </Screen>
  );
}
