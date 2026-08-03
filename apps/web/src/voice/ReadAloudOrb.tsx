// The reading orb: small, dotted, monochrome -- it takes the ink colour of
// whatever it sits in. Asking to be read to gives you two words, not a
// player.
import { ThinkingOrb } from "thinking-orbs";
import type { ReadAloud } from "./readAloud";
import "./ReadAloudOrb.css";

export function ReadAloudOrb({ voice, onStart }: { voice: ReadAloud; onStart: () => void }) {
  if (!voice.supported) return null;
  const speaking = voice.state === "speaking";
  return (
    <button
      type="button"
      className="read-orb"
      aria-label={speaking ? "Stop reading aloud" : "Read aloud"}
      onClick={() => (speaking ? voice.stop() : onStart())}
    >
      <span className="read-orb__word" aria-hidden="true">
        {speaking ? "quiet" : "read aloud"}
      </span>
      {/* working = the voice is working through the text; searching, held
          still, = quiet and ready. The mic orbs in the games run solving/
          composing, so the two jobs never wear the same face. */}
      <ThinkingOrb state={speaking ? "working" : "searching"} size={20} paused={!speaking} />
    </button>
  );
}
