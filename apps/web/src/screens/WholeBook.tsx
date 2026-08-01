// Screen 6, from frame 1e: inside a whole book. Slice 1A (PLAN.md §7)
// replaces the v0mock-backed version of this screen with the real reading
// path for one catalogue book: real chapter text, tap-to-gloss from the
// real gloss table, a place that survives reload, and a shell-owned
// encounter log that never touches the engine (ADR-031 -- book encounters
// are recorded and consume nothing; there is no import of ../engine
// anywhere in this file).
//
// The whisper of place is the fourth state in his frame: hold a finger on
// the page and the chapter name surfaces at the top, then goes. No
// percentage, no page count, no time left.
import { useEffect, useRef, useState } from "react";
import { Screen } from "../shell/Screen";
import "../components/PassagePage.css";
import "./WholeBook.css";
import { getBook } from "../content/catalogue";
import type { CatalogueBook } from "../content/catalogueTypes";
import { loadBookGlosses, glossFor, type BookGlossEntry } from "../content/glosses";
import { getPlace, recordEncounter, resetBookReadingState, setPlace } from "../reading/bookState";
import { tokenize } from "../content/render";
import { BookGlossCard } from "../components/BookGlossCard";
import { RecoveryScreen } from "../components/RecoveryScreen";
import { NotFound } from "./NotFound";

const HOLD_MS = 450;
const WHISPER_MS = 2400;
// The IntersectionObserver's own "has the reader reached this paragraph"
// band: a paragraph counts once its top has crossed 25% down the viewport,
// which is generous enough that a quick scroll past several short
// paragraphs still lands on the last one the reader's eye actually reached,
// rather than the first one that technically touched the band.
const PLACE_ROOT_MARGIN = "0px 0px -75% 0px";

type Status = "loading" | "ready" | "not-found" | "error";

export function WholeBook({ id }: { id: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [book, setBook] = useState<CatalogueBook | null>(null);
  const [glosses, setGlosses] = useState<Record<string, BookGlossEntry>>({});
  const [partIndex, setPartIndex] = useState(0);
  const [activeWord, setActiveWord] = useState<string | null>(null);
  const [placeWhisper, setPlaceWhisper] = useState(false);

  const holdTimer = useRef<number | undefined>(undefined);
  const fadeTimer = useRef<number | undefined>(undefined);
  const blockRefs = useRef<Map<number, HTMLElement>>(new Map());
  const resumeTarget = useRef<number | null>(null);
  const furthestBlock = useRef(0);

  async function load() {
    setStatus("loading");
    try {
      const found = await getBook(id);
      if (!found) {
        setStatus("not-found");
        return;
      }
      // A missing/unfetchable gloss table degrades to "no gloss yet" per
      // word (glosses.ts's own fallback) rather than blocking reading --
      // the text is the thing that must load for this screen to mean
      // anything; the gloss table failing is recoverable one word at a time.
      const table = await loadBookGlosses(found.id).catch(() => ({}) as Record<string, BookGlossEntry>);
      // An actual storage error (IndexedDB unavailable/blocked) propagates
      // out of getPlace and is treated the same as a content-fetch failure
      // below; a merely-absent or malformed saved place resolves to null
      // and this screen starts the book from its first page, which is
      // never a data-loss situation (see bookState.ts's own comment).
      const savedPlace = await getPlace(found.id);

      const startPart = Math.min(savedPlace?.partIndex ?? 0, found.parts.length - 1);
      resumeTarget.current = savedPlace?.partIndex === startPart ? (savedPlace?.blockIndex ?? 0) : 0;
      furthestBlock.current = resumeTarget.current;
      blockRefs.current = new Map();

      setBook(found);
      setGlosses(table);
      setPartIndex(startPart);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    void load();
    return () => {
      window.clearTimeout(holdTimer.current);
      window.clearTimeout(fadeTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const part = book?.parts[partIndex];

  // Restores scroll to a resumed place once the chapter's paragraphs have
  // mounted, then hands tracking over to the observer below.
  useEffect(() => {
    if (status !== "ready" || !part) return;
    const target = resumeTarget.current;
    resumeTarget.current = null;
    if (!target) return;
    const el = blockRefs.current.get(target);
    el?.scrollIntoView({ block: "start" });
  }, [status, part]);

  // Tracks how far into the chapter the reader has scrolled and persists it
  // -- the "location" half of Slice 1A's book/part/location identifier.
  // Monotonic within a chapter (only advances) so scrolling back up to
  // reread does not move the saved place backwards.
  useEffect(() => {
    if (status !== "ready" || !book || !part) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let advanced = false;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.blockIndex);
          if (Number.isFinite(index) && index > furthestBlock.current) {
            furthestBlock.current = index;
            advanced = true;
          }
        }
        if (advanced) {
          void setPlace({
            bookId: book.id,
            partIndex,
            blockIndex: furthestBlock.current,
            updatedAt: Date.now(),
          }).catch(() => {
            // A place write failing mid-scroll is not itself worth
            // interrupting reading over -- if storage is genuinely broken
            // the next open's getPlace() surfaces the calm retry screen.
          });
        }
      },
      { rootMargin: PLACE_ROOT_MARGIN },
    );
    for (const el of blockRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [status, book, part, partIndex]);

  if (status === "loading") {
    return (
      <Screen back={{ to: "/library", label: "Library" }}>
        <p className="reading-status">Finding your place.</p>
      </Screen>
    );
  }
  if (status === "not-found") return <NotFound />;
  if (status === "error") {
    return (
      <RecoveryScreen
        back={{ to: "/library", label: "Library" }}
        onRetry={() => void load()}
        onReset={() =>
          void resetBookReadingState()
            .catch(() => {})
            .then(() => load())
        }
      />
    );
  }
  if (!book || !part) return <NotFound />;

  function startHold() {
    window.clearTimeout(fadeTimer.current);
    holdTimer.current = window.setTimeout(() => {
      setPlaceWhisper(true);
      fadeTimer.current = window.setTimeout(() => setPlaceWhisper(false), WHISPER_MS);
    }, HOLD_MS);
  }
  function endHold() {
    window.clearTimeout(holdTimer.current);
  }

  function handleTap(word: string, blockIndex: number, context: string) {
    setActiveWord(word);
    const now = Date.now();
    void recordEncounter({ bookId: book!.id, partIndex, blockIndex, word, context }, now).catch(() => {});
  }

  function goNext() {
    const next = partIndex + 1;
    if (next >= book!.parts.length) {
      window.location.assign(`${import.meta.env.BASE_URL}shelf`);
      return;
    }
    resumeTarget.current = 0;
    furthestBlock.current = 0;
    blockRefs.current = new Map();
    setPartIndex(next);
    window.scrollTo(0, 0);
    void setPlace({ bookId: book!.id, partIndex: next, blockIndex: 0, updatedAt: Date.now() }).catch(() => {});
  }

  const placeLabel = `${book.title} · ${part.label}`;

  return (
    <Screen back={{ to: "/library", label: "Library" }} title={placeWhisper ? placeLabel : undefined}>
      <div
        className="whole-book"
        data-book-id={book.id}
        data-part-index={partIndex}
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
      >
        <span className="sb-eyebrow">{part.label}</span>

        {part.blocks.map((block, i) => {
          const tokens = tokenize(block.text);
          return (
            <p
              key={i}
              className="passage-text"
              data-block-index={i}
              ref={(el) => {
                if (el) blockRefs.current.set(i, el);
                else blockRefs.current.delete(i);
              }}
            >
              {tokens.map((token, j) =>
                token.type === "word" ? (
                  <button
                    key={j}
                    type="button"
                    className="passage-word"
                    onClick={() => handleTap(token.text, i, block.text)}
                  >
                    {token.text}
                  </button>
                ) : (
                  <span key={j}>{token.text}</span>
                ),
              )}
            </p>
          );
        })}
      </div>

      <div className="whole-book__foot">
        <button type="button" className="whole-book__pull" aria-label="Next chapter" onClick={goNext} />
      </div>

      {activeWord && (
        <BookGlossCard
          key={activeWord}
          word={activeWord}
          entry={glossFor(glosses, activeWord)}
          onDismiss={() => setActiveWord(null)}
        />
      )}
    </Screen>
  );
}
