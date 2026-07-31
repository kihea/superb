// Screen 6, from frame 1e: inside a whole book. Three settings, because
// three kinds of text need three -- prose runs, verse keeps the author's
// line breaks with a hanging indent so a wrapped line never reads as a new
// one, and a play puts the speaker in the UI face and leaves the speech in
// the reading face.
//
// The whisper of place is the fourth state in his frame: hold a finger on
// the page and the chapter name surfaces at the top, then goes. No
// percentage, no page count, no time left.
import { useEffect, useRef, useState } from "react";
import { Screen } from "../shell/Screen";
import { useNavigate } from "../router/context";
import { bookById, wholeBookParts } from "../v0mock";
import type { BookPart } from "../v0mock";
import { VoiceOrb } from "../components/voice/VoiceOrb";
import { NotFound } from "./NotFound";
import "./WholeBook.css";

const HOLD_MS = 450;
const WHISPER_MS = 2400;

export function WholeBook({ id }: { id: string }) {
  const navigate = useNavigate();
  const book = bookById(id);
  const [place, setPlace] = useState(false);
  const holdTimer = useRef<number | undefined>(undefined);
  const fadeTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(holdTimer.current);
      window.clearTimeout(fadeTimer.current);
    },
    [],
  );

  if (!book) return <NotFound />;

  // Books without a hand-set part fall back to their own opening line, set
  // as prose -- every book in the library opens to something.
  const part: BookPart = wholeBookParts[id] ?? {
    shape: "prose",
    label: "I",
    place: `${book.title} · the beginning`,
    blocks: [[book.opening]],
  };

  function startHold() {
    window.clearTimeout(fadeTimer.current);
    holdTimer.current = window.setTimeout(() => {
      setPlace(true);
      fadeTimer.current = window.setTimeout(() => setPlace(false), WHISPER_MS);
    }, HOLD_MS);
  }

  function endHold() {
    window.clearTimeout(holdTimer.current);
  }

  return (
    <Screen
      back={{ to: "/shelf", label: "Shelf" }}
      title={place ? part.place : undefined}
      trail={<VoiceOrb size={22} />}
    >
      <div
        className="whole-book"
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
      >
        <span className="sb-eyebrow">{part.label}</span>

        {part.shape === "prose" &&
          part.blocks.map((block, i) => (
            <p key={i} className="sb-passage">
              {block.join(" ")}
            </p>
          ))}

        {part.shape === "poetry" &&
          part.blocks.map((block, i) => (
            <div key={i} className="whole-book__verse">
              {block.map((line, j) => (
                <span key={j} className="whole-book__line">
                  {line}
                </span>
              ))}
            </div>
          ))}

        {part.shape === "play" &&
          part.blocks.map((block, i) => (
            <div key={i} className="whole-book__speech">
              <span className="whole-book__speaker">{part.speakers?.[i]}</span>
              <div className="whole-book__verse">
                {block.map((line, j) => (
                  <span key={j} className="whole-book__line">
                    {line}
                  </span>
                ))}
              </div>
            </div>
          ))}
      </div>

      <div className="whole-book__foot">
        <button
          type="button"
          className="whole-book__pull"
          aria-label="Next passage"
          onClick={() => navigate("/")}
        />
      </div>
    </Screen>
  );
}
