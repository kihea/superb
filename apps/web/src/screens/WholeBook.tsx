// Inside a book.
//
// The audit's fourth and worst finding: the product's whole claim is the
// reading experience, and it shipped as scrolled paragraphs in a default
// viewport — no page, no measure, no sense of place, no craft. Every other
// screen was at least considered; this one was a <p>.
//
// So it has a page now. The chapter is laid into columns the height of the
// window and turned, one screenful at a time, with a ribbon down the edge
// showing how far through the chapter you are. The measure, the size, the
// leading and the paper are all set from a sheet that rises over the page,
// and the reader can dim everything except the spread they are on.
//
// What has not changed: ordinary reading still records nothing. This file
// never imports the engine, and there is no encounter log. Only words the
// book's own gloss table knows are tappable, because a tap that answers
// "no meaning saved" is a tap wasted.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import "./WholeBook.css";
import { useNavigate } from "../router/context";
import { getBook } from "../content/catalogue";
import type { CatalogueBook } from "../content/catalogueTypes";
import { loadBookGlosses, type BookGlossEntry } from "../content/glosses";
import { getPlace, markFinished, resetBookReadingState, setPlace } from "../reading/bookState";
import { LEADS, PAPERS, SIZES, usePageSettings, type Lead, type Paper, type Size } from "../reading/settings";
import { tokenize } from "../content/render";
import { BookGlossCard } from "../components/BookGlossCard";
import { RecoveryScreen } from "../components/RecoveryScreen";
import { NotFound } from "./NotFound";
import { useReadAloud } from "../voice/readAloud";
import { ReadAloudOrb } from "../voice/ReadAloudOrb";

const COLUMN_GAP = 56;
/** Past this width the page opens into a spread, the way a book does. */
const SPREAD_FROM = 900;

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
  const { settings, set } = usePageSettings();
  const [status, setStatus] = useState<Status>("loading");
  const [book, setBook] = useState<CatalogueBook | null>(null);
  const [glosses, setGlosses] = useState<Record<string, BookGlossEntry>>({});
  const [partIndex, setPartIndex] = useState(0);
  const [tapped, setTapped] = useState<TappedWord | null>(null);
  const [sheet, setSheet] = useState<"none" | "type" | "contents">("none");

  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [column, setColumn] = useState({ width: 420, perPage: 1 });

  const viewportRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  const ticksRef = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const blockRefs = useRef<Map<number, HTMLElement>>(new Map());
  const resumeBlock = useRef<number | null>(null);
  const furthestBlock = useRef(0);

  const part = book?.parts[partIndex];
  const voice = useReadAloud(part?.blocks.map((b) => b.text) ?? []);

  /* ── loading ─────────────────────────────────────────────────────── */

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const found = await getBook(id);
      if (!found) {
        setStatus("not-found");
        return;
      }
      // A missing gloss table degrades to "no word is tappable" rather than
      // blocking reading — the text is the thing that must load.
      const table = await loadBookGlosses(found.id).catch(() => ({}) as Record<string, BookGlossEntry>);
      const savedPlace = await getPlace(found.id);
      if (!savedPlace) {
        // Opening a book is starting it — the Shelf should say Chapter I,
        // not "not started", the moment the first page is on screen.
        void setPlace({ bookId: found.id, partIndex: 0, blockIndex: 0, updatedAt: Date.now() }).catch(() => {});
      }

      const startPart = Math.min(savedPlace?.partIndex ?? 0, found.parts.length - 1);
      resumeBlock.current = savedPlace?.partIndex === startPart ? (savedPlace?.blockIndex ?? 0) : 0;
      furthestBlock.current = resumeBlock.current ?? 0;
      blockRefs.current = new Map();

      setBook(found);
      setGlosses(table);
      setPartIndex(startPart);
      setPage(0);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ── measuring the page ──────────────────────────────────────────── */

  /** How wide a column is, and how many of them a turn moves. Both come off
   *  the window, so rotating a phone or dragging a window re-sets the page
   *  rather than clipping it. */
  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    const flow = flowRef.current;
    if (!viewport || !flow) return;
    const width = viewport.clientWidth;
    const perPage = width > SPREAD_FROM ? 2 : 1;
    const columnWidth = perPage === 2 ? Math.floor((width - COLUMN_GAP) / 2) : width;
    const step = columnWidth + COLUMN_GAP;
    const columns = Math.max(1, Math.round(flow.scrollWidth / step));
    setColumn({ width: columnWidth, perPage });
    setPages(Math.max(1, Math.ceil(columns / perPage)));
  }, []);

  useLayoutEffect(() => {
    if (status !== "ready") return;
    measure();
    const observer = new ResizeObserver(() => measure());
    if (viewportRef.current) observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, [status, measure, partIndex, settings.size, settings.lead, settings.justify]);

  /** Which page a block landed on, once the columns have been laid out. */
  const pageOfBlock = useCallback(
    (index: number): number | null => {
      const el = blockRefs.current.get(index);
      if (!el) return null;
      const step = column.width + COLUMN_GAP;
      if (step <= 0) return null;
      return Math.floor(Math.floor(el.offsetLeft / step) / column.perPage);
    },
    [column],
  );

  // Coming back to a book lands on the page the reader left, not on the
  // chapter's first page. The columns have to exist before that can be
  // worked out, so it happens after the measure above.
  useLayoutEffect(() => {
    if (status !== "ready") return;
    const target = resumeBlock.current;
    if (target === null || target === 0) {
      resumeBlock.current = null;
      return;
    }
    const landed = pageOfBlock(target);
    if (landed === null) return;
    resumeBlock.current = null;
    setPage(Math.min(landed, Math.max(0, pages - 1)));
  }, [status, pages, pageOfBlock]);

  /* ── keeping the place ───────────────────────────────────────────── */

  // The place is the first block on the page being read, and it only ever
  // advances within a chapter — turning back to reread does not move it.
  useEffect(() => {
    if (status !== "ready" || !book) return;
    let first: number | null = null;
    for (const [index] of blockRefs.current) {
      if (pageOfBlock(index) === page) {
        first = first === null ? index : Math.min(first, index);
      }
    }
    if (first === null || first <= furthestBlock.current) return;
    furthestBlock.current = first;
    void setPlace({ bookId: book.id, partIndex, blockIndex: first, updatedAt: Date.now() }).catch(() => {
      // A place write failing mid-read is not worth interrupting reading
      // over; if storage is genuinely broken the next open's getPlace()
      // surfaces the calm retry screen.
    });
  }, [page, status, book, partIndex, pageOfBlock]);

  /* ── turning ─────────────────────────────────────────────────────── */

  const turn = useCallback(
    (by: number) => {
      setPage((current) => Math.max(0, Math.min(pages - 1, current + by)));
    },
    [pages],
  );

  useEffect(() => {
    if (status !== "ready") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") turn(1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") turn(-1);
      if (e.key === "Escape") {
        setTapped(null);
        setSheet("none");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, turn]);

  // The page keeps up with the voice, when the reader has asked it to.
  useEffect(() => {
    if (!settings.followPage || voice.activeBlock === null) return;
    const landed = pageOfBlock(voice.activeBlock);
    if (landed !== null && landed !== page) setPage(landed);
    // `page` is deliberately absent: this should run when the voice moves,
    // not every time the page does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.activeBlock, settings.followPage, pageOfBlock]);

  /* ── the screens that are not the page ───────────────────────────── */

  if (status === "loading") {
    return (
      <div className="reader reader--waiting">
        <p className="meta">Finding your place.</p>
      </div>
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

  /* ── the page ────────────────────────────────────────────────────── */

  function handleTap(word: string, blockText: string) {
    const entry = glosses[word.toLowerCase()];
    if (!entry) return;
    setSheet("none");
    setTapped({ word, entry, context: sentenceAround(blockText, word) });
  }

  const lastPart = partIndex >= book.parts.length - 1;

  function goToPart(next: number) {
    setSheet("none");
    if (next === partIndex) return;
    resumeBlock.current = 0;
    furthestBlock.current = 0;
    blockRefs.current = new Map();
    setPartIndex(next);
    setPage(0);
    void setPlace({ bookId: book!.id, partIndex: next, blockIndex: 0, updatedAt: Date.now() }).catch(() => {});
  }

  function goNextChapter() {
    if (lastPart) {
      void markFinished(book!.id, Date.now()).catch(() => {});
      navigate("/");
      return;
    }
    goToPart(partIndex + 1);
  }

  /** Which page a point along the tick strip lands on. */
  function pageAt(clientX: number): number {
    const el = ticksRef.current;
    if (!el) return page;
    const rect = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    return Math.round(frac * (pages - 1));
  }

  const atEndOfChapter = page >= pages - 1;
  const through = pages > 1 ? page / (pages - 1) : 1;

  return (
    <div className="reader" data-book-id={book.id} data-part-index={partIndex}>
      <header className="reader__top">
        <button
          type="button"
          className="reader__back"
          onClick={() => navigate(`/book/${book.id}`)}
          aria-label={`Leave ${book.title}`}
        >
          ←
        </button>
        <button
          type="button"
          className="reader__where"
          aria-expanded={sheet === "contents"}
          onClick={() => {
            setTapped(null);
            setSheet((s) => (s === "contents" ? "none" : "contents"));
          }}
        >
          <span className="reader__book">{book.title}</span>
          <span className="reader__chapter">
            {part.label || "—"} <span className="reader__caret" aria-hidden="true">⌄</span>
          </span>
        </button>
        <ReadAloudOrb voice={voice} onStart={() => voice.start(furthestBlock.current)} />
        <button
          type="button"
          className="reader__aa"
          aria-expanded={sheet === "type"}
          onClick={() => {
            setTapped(null);
            setSheet((s) => (s === "type" ? "none" : "type"));
          }}
        >
          Aa
        </button>
      </header>

      <div className="reader__stage">
        <div
          className="reader__viewport"
          ref={viewportRef}
          onPointerDown={(e) => {
            swipeStart.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={(e) => {
            const start = swipeStart.current;
            swipeStart.current = null;
            if (!start) return;
            const dx = e.clientX - start.x;
            const dy = e.clientY - start.y;
            if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) turn(dx < 0 ? 1 : -1);
          }}
        >
          <div
            className={`reader__flow${settings.focus ? " reader__flow--focus" : ""}`}
            ref={flowRef}
            style={{
              columnWidth: `${column.width}px`,
              columnGap: `${COLUMN_GAP}px`,
              transform: `translateX(${-page * (column.width + COLUMN_GAP) * column.perPage}px)`,
              fontSize: `${SIZES[settings.size].px}px`,
              lineHeight: LEADS[settings.lead].value,
              textAlign: settings.justify ? "justify" : "left",
            }}
          >
            {part.heading.length > 0 && (
              <div className="reader__heading">
                {part.heading.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            )}
            {part.blocks.map((block, i) => {
              const tokens = tokenize(block.text);
              const verse = block.type.includes("verse") || block.type.includes("song");
              const onThisPage = pageOfBlock(i) === page;
              return (
                <p
                  key={i}
                  className={`reader__block${verse ? " reader__block--verse" : ""}${
                    i === 0 ? " reader__block--opening" : ""
                  }${voice.activeBlock === i ? " reader__block--spoken" : ""}${
                    settings.focus && !onThisPage ? " reader__block--ahead" : ""
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
                        className="reader__word"
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
        </div>

        {/* The ribbon: how far through the chapter this page is, drawn as the
            bookmark it is rather than as a percentage. */}
        <div
          className="reader__ribbon"
          aria-hidden="true"
          style={{ height: `${34 + through * 46}px` }}
        />
      </div>

      <footer className="reader__foot">
        <button type="button" className="reader__turn" onClick={() => turn(-1)} disabled={page === 0}>
          ←
        </button>
        {/* The ticks are a scrubber: drag along them to riffle through the
            chapter, tap to land on a page. */}
        <div
          className="reader__ticks"
          ref={ticksRef}
          role="slider"
          tabIndex={0}
          aria-label="Page"
          aria-valuemin={1}
          aria-valuemax={pages}
          aria-valuenow={page + 1}
          onPointerDown={(e) => {
            scrubbing.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            setPage(pageAt(e.clientX));
          }}
          onPointerMove={(e) => {
            if (scrubbing.current) setPage(pageAt(e.clientX));
          }}
          onPointerUp={() => {
            scrubbing.current = false;
          }}
        >
          {Array.from({ length: Math.min(pages, 40) }, (_, i) => (
            <span key={i} className={`reader__tick${i <= page ? " reader__tick--past" : ""}`} />
          ))}
        </div>
        <span className="reader__count">
          {page + 1} / {pages}
        </span>
        {atEndOfChapter ? (
          <button type="button" className="reader__turn reader__turn--onward" onClick={goNextChapter}>
            {lastPart ? "The end" : (book.parts[partIndex + 1]?.label ?? "Next")} →
          </button>
        ) : (
          <button type="button" className="reader__turn" onClick={() => turn(1)}>
            →
          </button>
        )}
      </footer>

      {sheet === "contents" && (
        <div className="reader__sheet reader__sheet--contents enter-sheet">
          <div className="reader__sheet-inner">
            <div className="reader__sheet-head">
              <span className="eyebrow">Contents</span>
              <button type="button" className="reader__sheet-close" onClick={() => setSheet("none")}>
                close
              </button>
            </div>
            <ol className="reader__contents">
              {book.parts.map((p) => (
                <li key={p.index}>
                  <button
                    type="button"
                    className={`reader__contents-row${p.index === partIndex ? " reader__contents-row--here" : ""}`}
                    aria-current={p.index === partIndex ? "true" : undefined}
                    onClick={() => goToPart(p.index)}
                  >
                    <span className="reader__contents-label">{p.label || String(p.index + 1)}</span>
                    <span className="reader__contents-leader" aria-hidden="true" />
                    {p.heading.length > 0 && <span className="reader__contents-heading">{p.heading[0]}</span>}
                    {p.index === partIndex && <span className="reader__contents-mark" aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {sheet === "type" && (
        <div className="reader__sheet enter-sheet">
          <div className="reader__sheet-inner">
            <div className="reader__sheet-head">
              <span className="eyebrow">Setting the page</span>
              <button type="button" className="reader__sheet-close" onClick={() => setSheet("none")}>
                close
              </button>
            </div>
            <Row label="size">
              {(Object.keys(SIZES) as Size[]).map((key) => (
                <Choice key={key} on={settings.size === key} onPick={() => set("size", key)}>
                  {SIZES[key].label}
                </Choice>
              ))}
            </Row>
            <Row label="line spacing">
              {(Object.keys(LEADS) as Lead[]).map((key) => (
                <Choice key={key} on={settings.lead === key} onPick={() => set("lead", key)}>
                  {LEADS[key].label}
                </Choice>
              ))}
            </Row>
            <Row label="paper">
              {PAPERS.map((paper) => (
                <Choice
                  key={paper.id}
                  on={settings.paper === paper.id}
                  onPick={() => set("paper", paper.id as Paper)}
                >
                  {paper.label}
                </Choice>
              ))}
            </Row>
            <Row label="edges">
              <Choice on={!settings.justify} onPick={() => set("justify", false)}>
                Ragged
              </Choice>
              <Choice on={settings.justify} onPick={() => set("justify", true)}>
                Justified
              </Choice>
            </Row>
            <Row label="focus">
              <Choice on={!settings.focus} onPick={() => set("focus", false)}>
                Whole chapter
              </Choice>
              <Choice on={settings.focus} onPick={() => set("focus", true)}>
                Dim what is ahead
              </Choice>
            </Row>
          </div>
        </div>
      )}

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
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="reader__row">
      <span className="reader__row-label">{label}</span>
      <div className="reader__row-choices" role="group" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

function Choice({ on, onPick, children }: { on: boolean; onPick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={`reader__choice${on ? " reader__choice--on" : ""}`}
      aria-pressed={on}
      onClick={onPick}
    >
      {children}
    </button>
  );
}
