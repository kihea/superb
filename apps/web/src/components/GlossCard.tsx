// The seam crossing (ADR-019): the one object that has to read as belonging
// to the reading it arrived out of and to the register everything else in
// the app speaks. Its content surface stays the passage's own paper --
// definitions are read the same way the passage is -- and only its outer
// edge answers to the register underneath it.
import "./GlossCard.css";
import { useEffect, useRef } from "react";
import { glossFor } from "../fixtures/glosses";

export interface GlossCardProps {
  word: string;
  onDismiss: () => void;
}

export function GlossCard({ word, onDismiss }: GlossCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const entry = glossFor(word);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div className="gloss-backdrop" onClick={onDismiss}>
      <div
        ref={cardRef}
        className="gloss-card"
        role="dialog"
        aria-label={word}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="gloss-word">{word}</p>
        <p className="gloss-definition">{entry.definition}</p>
        <p className="gloss-elsewhere">{entry.elsewhere}</p>
      </div>
    </div>
  );
}
