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
import { BreakChain } from "./doodle/BreakChain";
import { DoodleArrow } from "./doodle/DoodleArrow";

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

      {/* The sentinel marks the end of the passage's *text*, which is what
         "the reader has reached the end" actually means -- not the end of
         the box's trailing padding, where it used to sit. With the room
         restyled to 3a the padded box came to about one screen tall, and
         the sentinel landed thirty pixels below the observer's threshold:
         the pull-up bar then never appeared on a desktop viewport at all,
         and eight tests said so. Anchoring it to the text rather than to
         the layout takes the whole class of failure away. */}
      <div ref={sentinelRef} aria-hidden="true" />

      {/* The passage-break chain (DERIVATION-001, superb-hand-break.svg),
         used here as the mark that a passage has ended -- a property of the
         whole passage, never of where a target word happens to sit within
         it, so its position on screen carries no information about which
         word the engine cared about (law 3). Kihea drew this mark for
         "between two halves of a passage"; this screen has one continuous
         passage, not two visible halves, so it was built as an end-of-
         passage mark instead. That is a real deviation from what he drew,
         it is on the record (workspace/decisions/README.md, the register
         decision), and it is the first thing to revisit if the mark ever
         feels wrong -- not changed here, because the choice was made on
         the screen as built. */}
      <BreakChain />

      {/* Portalled for the same reason GlossCard is: this article carries a
         lingering identity transform from its own entrance animation once
         it finishes (animation-fill-mode: both), which silently makes it
         the containing block for any position: fixed descendant instead of
         the viewport. In the glass register that landed the button on the
         card's own surface, styled for the dark ground behind it -- pale
         text on a pale card, unreadable. Escaping to document.body is the
         fix that holds regardless of how tall the passage or its card is. */}
      {/* ADR-036's pixel break (B4) does NOT live here -- an earlier
         version mounted <PixelBreak> as this button's own child and fired
         onFinish in the same click handler, and that lost the animation
         outright: onFinish triggers PassagePage's own remount (a new
         `passage.id` key on ReadingScreen), which tears this button and
         its child down before the flourish paints a frame, watched
         failing even single-worker, not merely under load. ReadingScreen
         owns the break instead, since it is the one thing that survives a
         passage-to-passage transition -- see its own comment. */}
      {createPortal(
        <div className={`passage-continue${nearEnd ? " passage-continue--visible" : ""}`}>
          <button type="button" className="passage-continue-button metal" onClick={onFinish}>
            Keep reading
            <span className="passage-continue-arrow" aria-hidden="true">
              <DoodleArrow />
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
