// One book, before you start: the cover on a paper panel, the first line
// already on the page -- you can tell whether you want it before you
// begin. Served from the catalogue index alone; the full text is only
// fetched when the reader actually begins.
import { useEffect, useState } from "react";
import { Screen } from "../shell/Screen";
import { useNavigate } from "../router/context";
import { getIndexRow, type CatalogueIndexRow } from "../content/catalogue";
import { addToShelf } from "../reading/bookState";
import { Cover } from "../components/Cover";
import { clothFor } from "./Shelf";
import { RecoveryScreen } from "../components/RecoveryScreen";
import { NotFound } from "./NotFound";
import "./BookCover.css";

type Status = "loading" | "ready" | "not-found" | "error";

export function BookCover({ id }: { id: string }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("loading");
  const [row, setRow] = useState<CatalogueIndexRow | null>(null);

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
  if (!row) return <NotFound />;

  function begin() {
    void addToShelf(row!.id, Date.now()).catch(() => {});
    navigate(`/book/${row!.id}/read`);
  }

  function addForLater() {
    void addToShelf(row!.id, Date.now()).catch(() => {});
    navigate("/");
  }

  return (
    <Screen back={{ to: "/library", label: "Library" }}>
      <div className="book-wash" aria-hidden="true" />

      <div className="book-head">
        <Cover book={{ title: row.title, author: row.author, cloth: clothFor(row.id) }} size="xl" />
      </div>

      <div className="book-names">
        <h2 className="sb-heading">{row.title}</h2>
        <span className="sb-said">
          {row.author}
          {row.translator ? ` · translated by ${row.translator}` : ""}
        </span>
        <span className="sb-caption">
          {row.chapterCount} {row.chapterCount === 1 ? "chapter" : "chapters"}
        </span>
      </div>

      {row.description && <p className="sb-said book-description">{row.description}</p>}

      {row.firstLine && (
        <div className="sb-card book-opening">
          <span className="sb-eyebrow">It begins</span>
          <p className="book-opening__line">“{row.firstLine}”</p>
        </div>
      )}

      <p className="sb-caption">Out of copyright — free to read, keep, and pass on.</p>

      <div className="book-actions">
        <button type="button" className="sb-button sb-button--wide" onClick={begin}>
          Begin
        </button>
        <button type="button" className="sb-quiet sb-quiet--centred" onClick={addForLater}>
          Add to shelf
        </button>
      </div>
    </Screen>
  );
}
