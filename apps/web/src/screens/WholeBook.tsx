// Inside a book. Real chapter text, tap-to-gloss from the book's own gloss
// table, a place that survives reload. Ordinary reading records nothing:
// this file never imports the engine, and there is no encounter log.
//
// Only words the gloss table knows are tappable -- a word with no meaning
// saved is plain text, because a tap that answers "this word doesn't have a
// meaning saved yet" is a tap wasted.
//
// The whisper of place: hold a finger on the page and the chapter name
// surfaces at the top, then goes. No percentage, no page count, no time
// left.
import { useEffect, useRef, useState } from "react";
import { Screen } from "../shell/Screen";
import "../components/PassagePage.css";
import "./WholeBook.css";
import { useNavigate } from "../router/context";
import { getBook } from "../content/catalogue";
import type { CatalogueBook } from "../content/catalogueTypes";
import { loadBookGlosses, type BookGlossEntry } from "../content/glosses";
import { getPlace, markFinished, resetBookReadingState, setPlace } from "../reading/bookState";
import { tokenize } from "../content/render";
import { BookGlossCard } from "../components/BookGlossCard";
import { RecoveryScreen } from "../components/RecoveryScreen";
import { NotFound } from "./NotFound";
import { useReadAloud } from "../voice/readAloud";
import { ReadAloudOrb } from "../voice/ReadAloudOrb";

const HOLD_MS = 450;
const WHISPER_MS = 2400;
// The IntersectionObserver's own "has the reader reached this paragraph"
// band: a paragraph counts once its top has crossed 25% down the viewport,
// which is generous enough that a quick scroll past several short
// paragraphs still lands on the last one the reader's eye actually reached,
// rather than the first one that technically touched the band.
const PLACE_ROOT_MARGIN = "0px 0px -75% 0px";

type Status = "loading" | "ready" | "not-found" | "error";

interface TappedWord {
  word: string;
  entry: BookGlossEntry;
  context: string;
}

/** The sentence around a word, for keeping alongside it. */
function sentenceAround(text: string, word: string): string {
  const sentences = text.split(/(?<=[.!?…”"])\s+/);
  const hit = sentences.find((s) => s.toLowerCase().includes(word.toLowerCase()));
  return (hit ?? text).slice(0, 240);
}

export function WholeBook({ id }: { id: string }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("loading");
  const [book, setBook] = useState<CatalogueBook | null>(null);
  const [glosses, setGlosses] = useState<Record<string, BookGlossEntry>>({});
  const [partIndex, setPartIndex] = useState(0);
  const [tapped, setTapped] = useState<TappedWord | null>(null);
  const [placeWhisper, setPlaceWhisper] = useState(false);

  const holdTimer = useRef<number | undefined>(undefined);
  const fadeTimer = useRef<number | undefined>(undefined);
  const blockRefs = useRef<Map<number, HTMLElement>>(new Map());
  const resumeTarget = useRef<number | null>(null);
  const furthestBlock = useRef(0);

  const voice = useReadAloud(book?.parts[partIndex]?.blocks.map((b) => b.text) ?? []);

  // The page follows the voice, gently.
  useEffect(() => {
    if (voice.activeBlock === null) return;
    const el = blockRefs.current.get(voice.activeBlock);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [voice.activeBlock]);

  async function load() {
    setStatus("loading");
    try {
      const found = await getBook(id);
      if (!found) {
        setStatus("not-found");
        return;
      }
      // A missing gloss table degrades to "no word is tappable" rather than
      // blocking reading -- the text is the thing that must load.
      const table = await loadBookGlosses(found.id).catch(() => ({}) as Record<string, BookGlossEntry>);
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

  // Tracks how far into the chapter the reader has scrolled and persists it.
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

  function handleTap(word: string, blockText: string) {
    const entry = glosses[word.toLowerCase()];
    if (!entry) return;
    setTapped({ word, entry, context: sentenceAround(blockText, word) });
  }

  const lastPart = partIndex >= book.parts.length - 1;

  function goNext() {
    if (lastPart) {
      void markFinished(book!.id, Date.now()).catch(() => {});
      navigate("/");
      return;
    }
    const next = partIndex + 1;
    resumeTarget.current = 0;
    furthestBlock.current = 0;
    blockRefs.current = new Map();
    setPartIndex(next);
    window.scrollTo(0, 0);
    void setPlace({ bookId: book!.id, partIndex: next, blockIndex: 0, updatedAt: Date.now() }).catch(
      () => {},
    );
  }

  const placeLabel = `${book.title} · ${part.label}`;
  const nextLabel = lastPart ? "The end" : (book.parts[partIndex + 1]?.label ?? "Next");

  return (
    <Screen
      back={{ to: `/book/${book.id}`, label: book.title }}
      title={placeWhisper ? placeLabel : undefined}
      trail={<ReadAloudOrb voice={voice} onStart={() => voice.start(furthestBlock.current)} />}
    >
      <div
        className="whole-book"
        data-book-id={book.id}
        data-part-index={partIndex}
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
      >
        <span className="sb-eyebrow">{part.label}</span>
        {part.heading.length > 0 && (
          <div className="whole-book__heading">
            {part.heading.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        )}

        {part.blocks.map((block, i) => {
          const tokens = tokenize(block.text);
          const verse = block.type.includes("verse") || block.type.includes("song");
          return (
            <p
              key={i}
              className={`passage-text${verse ? " whole-book__verse-block" : ""}${
                voice.activeBlock === i ? " whole-book__block--spoken" : ""
              }`}
              data-block-index={i}
              ref={(el) => {
                if (el) blockRefs.current.set(i, el);
                else blockRefs.current.delete(i);
              }}
            >
              {tokens.map((token, j) =>
                token.type === "word" && glosses[token.text.toLowerCase()] ? (
                  <button
                    key={j}
                    type="button"
                    className="passage-word"
                    onClick={() => handleTap(token.text, block.text)}
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
        <button type="button" className="whole-book__next" onClick={goNext}>
          <span className="whole-book__next-eyebrow">{lastPart ? "You read it all" : "Keep going"}</span>
          <span className="whole-book__next-label">{nextLabel}</span>
        </button>
      </div>

      {tapped && (
        <BookGlossCard
          key={tapped.word}
          word={tapped.word}
          entry={tapped.entry}
          bookId={book.id}
          context={tapped.context}
          onDismiss={() => setTapped(null)}
        />
      )}
    </Screen>
  );
}
