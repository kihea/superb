// The word card inside the prose game: the one object that has to read as
// belonging to the reading it arrived out of and to the room everything
// else in the app speaks. Its content surface stays the passage's own
// paper -- definitions are read the same way the passage is.
//
// Meanings resolve in order of care: the curated entries first
// (fixtures/glosses.ts, hand-written for the exact sense the passages
// use, and the only source of the "elsewhere" example line), then the
// prose gloss table (the dictionary cut over the slot lexicon and the
// corpus's target words), then an honest line saying the glossary does
// not have this one. Only a curated or table meaning is worth keeping;
// a miss keeps the word alone.
import "./GlossCard.css";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { glossFor } from "../fixtures/glosses";
import { loadProseGlosses, type BookGlossEntry } from "../content/glosses";
import { pickDefinition, useSharedSenses } from "../content/senses";
import { KeepButton } from "./KeepButton";
import { keepWord } from "../reading/words";

export interface GlossCardProps {
  word: string;
  /** The sentence the word was tapped inside — lets the card pick the
   *  sense the sentence actually uses (content/senses.ts). */
  context?: string;
  onDismiss: () => void;
}

let proseTable: Record<string, BookGlossEntry> | null = null;

export function GlossCard({ word, context, onDismiss }: GlossCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [table, setTable] = useState(proseTable);

  useEffect(() => {
    if (proseTable) return;
    loadProseGlosses()
      .then((loaded) => {
        proseTable = loaded;
        setTable(loaded);
      })
      .catch(() => {
        // The curated entries below still answer.
      });
  }, []);

  const curated = glossFor(word);
  const shared = useSharedSenses();
  const fromTable = table?.[word.toLowerCase()];
  // Curated entries are hand-written for the exact sense the passages use;
  // a table entry instead answers with the sense the sentence around the
  // tap actually uses (content/senses.ts).
  const meaning =
    curated?.definition ?? (fromTable ? pickDefinition(word, fromTable, context, shared) : undefined);
  // The same sentence content/glosses.ts's glossFor uses for a book-table
  // miss -- one voice for "no entry" everywhere a card can say it.
  const definition = meaning ?? "This word doesn't have a meaning saved yet.";
  const elsewhere = curated?.elsewhere;

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
          <p className="gloss-definition">{definition}</p>
          {elsewhere && <p className="gloss-elsewhere">{elsewhere}</p>}
        </div>
        {/* "Keep" is how the reader closes this card -- there is no reject
           gesture. The scatter runs first and the card follows it into
           stillness once it finishes. */}
        <div className="gloss-keep-row">
          <KeepButton
            onKeep={() => {
              void keepWord(
                { word, definition: meaning ?? "", source: "prose" },
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
