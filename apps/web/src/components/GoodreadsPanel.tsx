// The door in and out of Goodreads.
//
// Goodreads closed its API in 2020, so the only honest route is the file it
// still lets you take with you: My Books → Import and export → Export Library.
// This reads that CSV and writes one back in the same shape. Nothing is sent
// anywhere — the file is read in the browser and never leaves it, which is
// also the only thing that could be true of an app with no server.
//
// The import says exactly what it matched and what it did not, before and
// after, because a silent import that quietly drops a third of someone's
// reading life is worse than one that refuses.
import { useRef, useState } from "react";
import { loadIndex } from "../content/catalogue";
import { getMarks, putMarks } from "../reading/marks";
import { getShelf } from "../reading/bookState";
import { saveShelf } from "../storage/db";
import { applyImport, matchRows, readGoodreadsCsv, toGoodreadsCsv, type ImportResult } from "../reading/goodreads";
import "./GoodreadsPanel.css";

type State =
  | { at: "idle" }
  | { at: "reading" }
  | { at: "review"; result: ImportResult; text: string }
  | { at: "done"; brought: number; skipped: number }
  | { at: "failed"; why: string };

export function GoodreadsPanel() {
  const [state, setState] = useState<State>({ at: "idle" });
  const fileInput = useRef<HTMLInputElement>(null);

  async function chooseFile(file: File) {
    setState({ at: "reading" });
    try {
      const text = await file.text();
      const rows = readGoodreadsCsv(text);
      if (rows.length === 0) {
        setState({
          at: "failed",
          why: "That file has no Title and Author columns. It is probably not a Goodreads file.",
        });
        return;
      }
      const index = await loadIndex();
      setState({ at: "review", result: matchRows(rows, index), text: file.name });
    } catch {
      setState({ at: "failed", why: "Superb could not read that file." });
    }
  }

  async function bringThemIn(result: ImportResult) {
    try {
      const [marks, shelf] = await Promise.all([getMarks(), getShelf()]);
      const next = applyImport(result, marks, shelf, Date.now());
      await putMarks(next.marks);
      await saveShelf(next.shelf);
      setState({ at: "done", brought: result.matched.length, skipped: result.unmatched.length });
    } catch {
      setState({ at: "failed", why: "Superb could not save your ratings to this device." });
    }
  }

  async function takeThemOut() {
    const [marks, shelf, index] = await Promise.all([getMarks(), getShelf(), loadIndex()]);
    const csv = toGoodreadsCsv(marks, shelf, index);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `superb-library-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="settings__group goodreads" id="goodreads">
      <span className="eyebrow">Your books from Goodreads</span>
      <p className="goodreads__lede">
        Bring your ratings, reviews and shelves in from Goodreads, or take everything here out again.
        The file is read on this device and never sent anywhere.
      </p>

      <div className="goodreads__doors">
        <button type="button" className="btn btn--small" onClick={() => fileInput.current?.click()}>
          Import a Goodreads file
        </button>
        <button type="button" className="btn btn--small btn--quiet" onClick={() => void takeThemOut()}>
          Export as CSV
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void chooseFile(file);
            e.target.value = "";
          }}
        />
      </div>

      <p className="goodreads__how">
        On Goodreads: My Books → Import and export → Export Library, then bring the file it emails you
        back here.
      </p>

      {state.at === "reading" && <p className="goodreads__said">Reading the file.</p>}

      {state.at === "review" && (
        <div className="goodreads__review enter">
          <p className="goodreads__said">
            <strong>{state.result.matched.length}</strong>{" "}
            {state.result.matched.length === 1 ? "book" : "books"} in {state.text} are in this library.
            {state.result.unmatched.length > 0 && (
              <>
                {" "}
                <strong>{state.result.unmatched.length}</strong> are not, and will be left alone.
                The library is out-of-copyright editions only.
              </>
            )}
          </p>
          {state.result.matched.length > 0 && (
            <ul className="goodreads__list">
              {state.result.matched.slice(0, 8).map(({ book, row }) => (
                <li key={book.id}>
                  <span className="goodreads__title">{book.title}</span>
                  <span className="meta">
                    {row.myRating ? `${row.myRating}★` : "unrated"}
                    {row.myReview ? " · with your review" : ""}
                    {row.shelf ? ` · ${row.shelf}` : ""}
                  </span>
                </li>
              ))}
              {state.result.matched.length > 8 && (
                <li className="meta">and {state.result.matched.length - 8} more</li>
              )}
            </ul>
          )}
          <div className="goodreads__doors">
            <button
              type="button"
              className="btn btn--small"
              disabled={state.result.matched.length === 0}
              onClick={() => void bringThemIn(state.result)}
            >
              Bring them in
            </button>
            <button type="button" className="btn btn--small btn--quiet" onClick={() => setState({ at: "idle" })}>
              Not now
            </button>
          </div>
          <p className="meta">
            Anything you have already rated or written here keeps what you wrote; the import only
            fills what is empty.
          </p>
        </div>
      )}

      {state.at === "done" && (
        <p className="goodreads__said enter">
          {state.brought} {state.brought === 1 ? "book is" : "books are"} on your shelf with what you
          thought of {state.brought === 1 ? "it" : "them"}.
          {state.skipped > 0 && ` ${state.skipped} were not in this library.`}
        </p>
      )}

      {state.at === "failed" && <p className="goodreads__said goodreads__said--wrong">{state.why}</p>}
    </section>
  );
}
