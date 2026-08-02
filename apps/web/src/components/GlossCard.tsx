// The seam crossing (ADR-019): the one object that has to read as belonging
// to the reading it arrived out of and to the register everything else in
// the app speaks. Its content surface stays the passage's own paper --
// definitions are read the same way the passage is -- and only its outer
// edge answers to the register underneath it.
import "./GlossCard.css";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { glossFor } from "../fixtures/glosses";
import { KeepButton } from "./KeepButton";
import { keepWord } from "../reading/words";

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

  // Portalled to document.body rather than rendered in place. This card is
  // a child of PassagePage, and PassagePage's own entrance animation
  // (`passage-arrive`) leaves a lingering identity transform on its root
  // element after it finishes (animation-fill-mode: both keeps the final
  // keyframe's `transform: translateY(0)` applied at rest). Any non-`none`
  // transform on an ancestor creates a new containing block for
  // `position: fixed` descendants -- so `.gloss-backdrop`'s `inset: 0`
  // would resolve against that ancestor's box instead of the viewport
  // without this. Found via the same class of bug as the pull-up button.
  return createPortal(
    <div className="gloss-backdrop" onClick={onDismiss}>
      <div
        ref={cardRef}
        className="gloss-card"
        role="dialog"
        aria-label={word}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 3a puts the word and its one line side by side with the Keep,
            rather than stacked above a sheet -- hence the wrapper. */}
        <div className="gloss-card__text">
          <p className="gloss-word">{word}</p>
          <p className="gloss-definition">{entry.definition}</p>
          <p className="gloss-elsewhere">{entry.elsewhere}</p>
        </div>
        {/* "Keep" is how the reader closes this card -- there is no reject
           gesture. The scatter runs first and the card follows it into
           stillness once it finishes. */}
        <div className="gloss-keep-row">
          <KeepButton
            onKeep={() => {
              void keepWord(
                { word, definition: entry.definition, source: "prose" },
                Date.now(),
              ).catch(() => {});
            }}
            onKept={onDismiss}
          />
        </div>
        {/* A one-shot light run around the edge as the card lands --
           re-derived from the doodle-intake prototype's .beam (border-beam,
           interface-inspiration/border-beam.png; ADR-019 Decision 4).
           Reader-initiated (it only exists because a word was tapped) and
           it runs once, then stops -- material at rest, not a loop. */}
        <span className="gloss-beam" aria-hidden="true" />
      </div>
    </div>,
    document.body,
  );
}
