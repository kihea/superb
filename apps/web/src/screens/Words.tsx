// The reader's kept words.
//
// The audit's complaint was that "the collection is its own reward" was
// written down as a settings list: three fonts a card, no sense of
// accumulation, no way to sort, nothing that felt owned. So it is a ledger
// now — numbered, sortable, with a count of what has been gathered and from
// where — and each word still carries the sentence it was met in, because
// that is the part that makes it stick.
//
// Nothing here is scored. There are no strength bars, because ordinary
// reading tells the engine nothing, and inventing a mastery number for a word
// somebody merely kept would be a picture of progress rather than progress.
import { useEffect, useMemo, useState } from "react";
import { Room } from "../shell/Shell";
import { Link } from "../router/router";
import { getKeptSentences, getKeptWords, unkeepWord, type KeptSentence, type KeptWord } from "../reading/words";
import "./Words.css";

type Status = "loading" | "ready" | "error";
type Sort = "recent" | "alpha" | "source";

const SORTS: { id: Sort; label: string }[] = [
  { id: "recent", label: "recent" },
  { id: "alpha", label: "a to z" },
  { id: "source", label: "by book" },
];

/** Book ids are slugs; a word came from a book or from one of the games. */
function sourceName(source: string): string {
  if (source === "rhyme" || source === "association" || source === "prose") return source;
  const title = source.split("_").slice(1).join(" ");
  if (!title) return source;
  return title.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function Words() {
  const [status, setStatus] = useState<Status>("loading");
  const [words, setWords] = useState<KeptWord[]>([]);
  const [sentences, setSentences] = useState<KeptSentence[]>([]);
  const [sort, setSort] = useState<Sort>("recent");

  useEffect(() => {
    Promise.all([getKeptWords(), getKeptSentences()])
      .then(([kept, keptSentences]) => {
        setWords(kept);
        setSentences([...keptSentences].sort((a, b) => b.keptAt - a.keptAt));
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  const ordered = useMemo(() => {
    const list = [...words];
    if (sort === "alpha") list.sort((a, b) => a.word.localeCompare(b.word));
    else if (sort === "source") list.sort((a, b) => a.source.localeCompare(b.source) || a.word.localeCompare(b.word));
    else list.sort((a, b) => b.keptAt - a.keptAt);
    return list;
  }, [words, sort]);

  const places = new Set(words.map((w) => w.source)).size;

  function letGo(word: string) {
    void unkeepWord(word)
      .then(setWords)
      .catch(() => {});
  }

  if (status === "error") {
    return (
      <Room>
        <div className="room__head">
          <h1 className="mark">Your words</h1>
        </div>
        <p className="words__said">Your words did not open. Try again in a moment.</p>
      </Room>
    );
  }

  if (status === "ready" && words.length === 0 && sentences.length === 0) {
    return (
      <Room width="narrow">
        <div className="room__head">
          <h1 className="mark">Your words</h1>
        </div>
        <p className="words__said">You have not kept a word yet.</p>
        <p className="words__note">
          Tap a word while you read, then keep it. Superb saves it here with the sentence you found
          it in.
        </p>
        <Link to="/" className="btn btn--quiet words__door">
          Go and read a book
        </Link>
      </Room>
    );
  }

  return (
    <Room>
      <div className="room__head">
        <div className="words__title">
          <h1 className="mark">Your words</h1>
          <span className="meta">
            {words.length} kept{places > 0 ? ` · from ${places} ${places === 1 ? "place" : "places"}` : ""}
          </span>
        </div>
        <div className="words__sorts">
          {SORTS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="chip"
              aria-pressed={sort === option.id}
              onClick={() => setSort(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {words.length > 0 && (
        <ul className="words__list">
          {ordered.map((entry, i) => (
            <li key={entry.word} className="words__row">
              <span className="words__index">{String(i + 1).padStart(2, "0")}</span>
              <span className="words__word">{entry.word}</span>
              <span className="words__meaning">{entry.definition}</span>
              <span className="words__where">
                <span className="meta">{sourceName(entry.source)}</span>
                <button
                  type="button"
                  className="btn btn--bare words__letgo"
                  aria-label={`Let go of ${entry.word}`}
                  onClick={() => letGo(entry.word)}
                >
                  let go
                </button>
              </span>
              {entry.context && <span className="words__context">“{entry.context}”</span>}
            </li>
          ))}
        </ul>
      )}

      {sentences.length > 0 && (
        <section className="words__section">
          <span className="eyebrow">Sentences you kept</span>
          <ul className="words__sentences">
            {sentences.map((entry) => (
              <li key={entry.text}>“{entry.text}”</li>
            ))}
          </ul>
        </section>
      )}
    </Room>
  );
}
