// The passage itself -- law 3's whole burden lands here. Every word is an
// identical tap target (no bold, no colour, no underline on any of them);
// the only thing that ever changes is whether the gloss card is open.
import { useEffect, useRef, useState } from "react";
import "./PassagePage.css";
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

      {/* DECISION PENDING: https://github.com/kihea/superb/issues/30 -- a
         publication year is a number on the reading screen (law 3 says none
         outside Settings), reasoned here as a citation rather than a
         pedagogy metric. Kept until Kihea says otherwise. */}
      {record.pool === "sourced" && (
        <p className="passage-citation">
          — {record.provenance.author}, <em>{record.provenance.work}</em> ({record.provenance.year})
        </p>
      )}

      <div ref={sentinelRef} aria-hidden="true" />

      <div className={`passage-continue${nearEnd ? " passage-continue--visible" : ""}`}>
        <button type="button" className="passage-continue-button" onClick={onFinish}>
          Keep reading
        </button>
      </div>

      {activeWord && <GlossCard word={activeWord} onDismiss={() => setActiveWord(null)} />}
    </article>
  );
}
