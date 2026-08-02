// The book reader's word card: the tapped word, its plain meaning, and the
// Keep gesture. Reuses GlossCard's paper and beam wholesale; reads a real
// book's gloss table instead of the composed-passage fixtures.
import "./GlossCard.css";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { BookGlossEntry } from "../content/glosses";
import { KeepButton } from "./KeepButton";
import { keepWord } from "../reading/words";

export interface BookGlossCardProps {
  word: string;
  entry: BookGlossEntry;
  /** The book this word was met in -- recorded with the kept word. */
  bookId: string;
  /** The sentence around the tapped word, kept alongside it. */
  context?: string;
  onDismiss: () => void;
}

export function BookGlossCard({ word, entry, bookId, context, onDismiss }: BookGlossCardProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  function handleKeep() {
    void keepWord(
      { word, definition: entry.definition, source: bookId, context },
      Date.now(),
    ).catch(() => {
      // Storage failing must not trap the reader in the card.
    });
  }

  // Portalled for the same reason GlossCard.tsx is (see its comment): an
  // ancestor's resting transform would otherwise become the containing
  // block for this card's fixed backdrop.
  return createPortal(
    <div className="gloss-backdrop" onClick={onDismiss}>
      <div className="gloss-card" role="dialog" aria-label={word} onClick={(e) => e.stopPropagation()}>
        <div className="gloss-card__text">
          <p className="gloss-word">{word}</p>
          <p className="gloss-definition">{entry.definition}</p>
        </div>
        <div className="gloss-keep-row">
          <KeepButton onKeep={handleKeep} onKept={onDismiss} />
        </div>
        <span className="gloss-beam" aria-hidden="true" />
      </div>
    </div>,
    document.body,
  );
}
