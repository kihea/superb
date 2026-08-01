// The book reader's own gloss card -- same seam GlossCard.tsx crosses
// (ADR-019: the passage's own paper on the inside, the surrounding
// register on the outer edge), reusing its CSS wholesale, but reading a
// real book's gloss table (content/glosses.ts) instead of the composed-
// passage mock (src/fixtures/glosses.ts). Kept as its own component rather
// than a prop swap on GlossCard: that component's "Keep" gesture is a
// passage-reading feature (ADR-036) this slice does not extend to whole
// books, and its own comments document load-bearing details (the portal,
// the lingering-transform escape) specific to being a child of
// PassagePage -- forking is more honest here than threading an unused prop
// through a component whose docs would then describe behaviour that no
// longer applies uniformly.
import "./GlossCard.css";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { BookGlossEntry } from "../content/glosses";

export interface BookGlossCardProps {
  word: string;
  entry: BookGlossEntry;
  onDismiss: () => void;
}

export function BookGlossCard({ word, entry, onDismiss }: BookGlossCardProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  // Portalled for the same reason GlossCard.tsx is (see its own comment):
  // BookReader's chapter root carries its own entrance animation, which
  // would otherwise become the containing block for this card's fixed
  // backdrop.
  return createPortal(
    <div className="gloss-backdrop" onClick={onDismiss}>
      <div className="gloss-card" role="dialog" aria-label={word} onClick={(e) => e.stopPropagation()}>
        <div className="gloss-card__text">
          <p className="gloss-word">{word}</p>
          <p className="gloss-definition">{entry.definition}</p>
        </div>
        <span className="gloss-beam" aria-hidden="true" />
      </div>
    </div>,
    document.body,
  );
}
