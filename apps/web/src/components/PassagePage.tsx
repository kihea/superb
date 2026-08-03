// The passage itself -- law 3's whole burden lands here. Every word is an
// identical tap target (no bold, no colour, no underline on any of them);
// the only thing that ever changes is whether the gloss card is open.
import { useEffect, useRef, useState } from "react";
import "./PassagePage.css";
import { createPortal } from "react-dom";
import type { Passage } from "../engine/port";
import type { ComposedPassage, SourceExcerpt } from "../content/types";
import type { PassageToken } from "../content/render";
import { fillTemplate, groupIntoSentences, tokenize } from "../content/render";
import { GlossCard } from "./GlossCard";
import { HoldMenu } from "./HoldMenu";
import { DoodleArrow } from "./doodle/DoodleArrow";
import { keepSentence } from "../reading/words";
import { speakOnce } from "../voice/speak";

// Long enough that it cannot be mistaken for a tap on a word, short enough
// that it does not feel like waiting.
const HOLD_MS = 450;

export interface PassagePageProps {
  record: ComposedPassage | SourceExcerpt;
  passage: Passage;
  onWordTap: (word: string, position: number) => void;
  onFinish: () => void;
}

export function PassagePage({ record, passage, onWordTap, onFinish }: PassagePageProps) {
  const [activeWord, setActiveWord] = useState<{ word: string; context: string } | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [nearEnd, setNearEnd] = useState(false);

  // Holding a sentence (frame 1v) -- the only entrance to screen 14.
  const [held, setHeld] = useState<{ index: number; rect: DOMRect } | null>(null);
  const holdTimer = useRef<number | undefined>(undefined);
  // A hold ends with a pointerup over a word, which would otherwise open
  // that word's gloss on top of the menu. One flag, cleared on the next
  // press.
  const holdFired = useRef(false);

  const text = record.pool === "composed" ? fillTemplate(record.text, passage.fills) : record.text;
  const tokens = tokenize(text);
  const sentences = groupIntoSentences(tokens);

  // Frame 2k's "· 3 new": how many of the held sentence's words are the
  // engine's own first contact (Passage.seeded) rather than a scheduled
  // review (Passage.targets) -- issue #102, Kihea's own exception to law 3.
  // Counted here, off the same passage the engine actually composed, rather
  // than guessed from anything visible in the text.
  const seededWords = new Set(passage.seeded.map((word) => word.toLowerCase()));

  function sentenceText(sentence: PassageToken[]): string {
    return sentence
      .map((token) => token.text)
      .join("")
      .trim();
  }

  async function shareSentence(text: string) {
    // The device's own share sheet where there is one; the clipboard where
    // there is not. Either way the sentence actually goes somewhere.
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
    } catch {
      // A dismissed share sheet is not an error worth surfacing.
    }
  }

  function countNew(sentence: PassageToken[]): number {
    const found = new Set<string>();
    for (const token of sentence) {
      if (token.type === "word" && seededWords.has(token.text.toLowerCase())) {
        found.add(token.text.toLowerCase());
      }
    }
    return found.size;
  }

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setNearEnd(entry.isIntersecting), {
      rootMargin: "0px 0px -10% 0px",
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [record.id]);

  useEffect(() => () => window.clearTimeout(holdTimer.current), []);

  function handleTap(word: string, position: number, context: string) {
    if (holdFired.current) return;
    setActiveWord((current) => (current?.word === word ? null : { word, context }));
    onWordTap(word, position);
  }

  function startHold(index: number, target: HTMLElement) {
    holdFired.current = false;
    window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      holdFired.current = true;
      setHeld({ index, rect: target.getBoundingClientRect() });
    }, HOLD_MS);
  }

  function endHold() {
    window.clearTimeout(holdTimer.current);
  }

  return (
    <article className="passage-page" aria-label="Passage" data-passage-id={passage.id}>
      <p className={`passage-text${held ? " passage-text--holding" : ""}`}>
        {sentences.map((sentence, s) => (
          // Every sentence is the same object with the same behaviour --
          // holding any one of them does the same thing, so this grouping
          // carries no information about which words the engine cared
          // about (law 3), exactly as the word buttons do not.
          <span
            key={s}
            className={`passage-sentence${held?.index === s ? " passage-sentence--held" : ""}`}
            onPointerDown={(e) => startHold(s, e.currentTarget)}
            onPointerUp={endHold}
            onPointerCancel={endHold}
            onPointerLeave={endHold}
          >
            {sentence.map((token, i) =>
              token.type === "word" ? (
                <button
                  key={i}
                  type="button"
                  className="passage-word"
                  onClick={() => handleTap(token.text, token.position, sentenceText(sentence))}
                >
                  {token.text}
                </button>
              ) : (
                <span key={i}>{token.text}</span>
              ),
            )}
          </span>
        ))}
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

      {/* The break chain used to sit here as the passage-end mark
         (DERIVATION-001, superb-hand-break.svg) -- that comment's own words
         were "the first thing to revisit if the mark ever feels wrong," and
         issue #111 is Kihea revisiting it: "the wiggling lines under the
         passage" should go. ADR-041 answers the same way independently (no
         static ornament inside the text column, warmer surface or not), so
         this is removed rather than restyled -- BreakChain.tsx/.css are
         gone with it. The end of a passage is now just where the text
         stops; nothing marks it until "Keep reading" appears below. The
         private root's register decision this deviated from should get its
         own update to match; flagged to the architect rather than edited
         here, since that record lives outside this repo. */}

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
      {activeWord && (
        <GlossCard
          key={activeWord.word}
          word={activeWord.word}
          context={activeWord.context}
          onDismiss={() => setActiveWord(null)}
        />
      )}

      {held && (
        <HoldMenu
          anchor={held.rect}
          newCount={countNew(sentences[held.index])}
          onKeep={() => {
            const text = sentenceText(sentences[held.index]);
            setHeld(null);
            void keepSentence(text, "prose", Date.now()).catch(() => {});
          }}
          onHear={() => {
            const text = sentenceText(sentences[held.index]);
            setHeld(null);
            speakOnce(text);
          }}
          onSend={() => {
            const text = sentenceText(sentences[held.index]);
            setHeld(null);
            void shareSentence(text);
          }}
          onDismiss={() => setHeld(null)}
        />
      )}
    </article>
  );
}
