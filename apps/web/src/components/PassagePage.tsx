// The passage itself -- law 3's whole burden lands here. Every word is an
// identical tap target (no bold, no colour, no underline on any of them);
// the only thing that ever changes is whether the gloss card is open.
import { useEffect, useRef, useState } from "react";
import "./PassagePage.css";
import { createPortal } from "react-dom";
import type { Passage } from "../engine/port";
import type { ComposedPassage, SourceExcerpt } from "../content/types";
import { fillTemplate, tokenize } from "../content/render";
import { GlossCard } from "./GlossCard";

export interface PassagePageProps {
  record: ComposedPassage | SourceExcerpt;
  passage: Passage;
  onWordTap: (word: string, position: number) => void;
  onFinish: () => void;
}

export function PassagePage({ record, passage, onWordTap, onFinish }: PassagePageProps) {
  const [activeWord, setActiveWord] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [nearEnd, setNearEnd] = useState(false);

  const text = record.pool === "composed" ? fillTemplate(record.text, passage.fills) : record.text;
  const tokens = tokenize(text);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setNearEnd(entry.isIntersecting), {
      rootMargin: "0px 0px -10% 0px",
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [record.id]);

  function handleTap(word: string, position: number) {
    setActiveWord((current) => (current === word ? null : word));
    onWordTap(word, position);
  }

  return (
    <article className="passage-page" aria-label="Passage" data-passage-id={passage.id}>
      <p className="passage-text">
        {tokens.map((token, i) =>
          token.type === "word" ? (
            <button
              key={i}
              type="button"
              className="passage-word"
              onClick={() => handleTap(token.text, token.position)}
            >
              {token.text}
            </button>
          ) : (
            <span key={i}>{token.text}</span>
          ),
        )}
      </p>

      {/* Resolved: ADR-023 -- a publication year is a property of the text,
         not a measurement of the reader, so it is not the kind of number
         law 3 exists to stop. Byline ships under sourced excerpts only;
         composed passages have no author to cite. */}
      {record.pool === "sourced" && (
        <p className="passage-citation">
          — {record.provenance.author}, <em>{record.provenance.work}</em> ({record.provenance.year})
        </p>
      )}

      <div ref={sentinelRef} aria-hidden="true" />

      {/* Portalled for the same reason GlossCard is: this article carries a
         lingering identity transform from its own entrance animation once
         it finishes (animation-fill-mode: both), which silently makes it
         the containing block for any position: fixed descendant instead of
         the viewport. In the glass register that landed the button on the
         card's own surface, styled for the dark ground behind it -- pale
         text on a pale card, unreadable. Escaping to document.body is the
         fix that holds regardless of how tall the passage or its card is. */}
      {createPortal(
        <div className={`passage-continue${nearEnd ? " passage-continue--visible" : ""}`}>
          <button type="button" className="passage-continue-button metal" onClick={onFinish}>
            Keep reading
            <span className="passage-continue-arrow" aria-hidden="true">
              →
            </span>
          </button>
        </div>,
        document.body,
      )}

      {/* Keyed so a tap on a second word while the card is already open is a
         fresh arrival rather than a prop update on the same instance --
         every gloss gets its own entrance (GlossCard.css), not just the
         first one of a session. */}
      {activeWord && <GlossCard key={activeWord} word={activeWord} onDismiss={() => setActiveWord(null)} />}
    </article>
  );
}
