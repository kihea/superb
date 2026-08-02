// The prose game: a door, then reading. The passage behind the door is
// composed for this reader by the engine -- it knows which words are due
// and how far to reach -- so the door promises exactly what happens and
// nothing else. Once the passage opens it is just a passage; tapping the
// words you don't know is the whole exercise, and it is also how the
// engine learns.
import { useState } from "react";
import { Screen } from "../shell/Screen";
import { ReadingScreen } from "../components/ReadingScreen";
import "./Prose.css";

export function Prose() {
  const [open, setOpen] = useState(false);

  if (open) return <ReadingScreen />;

  return (
    <Screen back={{ to: "/play", label: "Play" }}>
      <div className="prose-door sb-rise">
        <span className="sb-eyebrow">Prose</span>
        <h2 className="sb-heading">A passage put together for you.</h2>
        <p className="sb-said">
          Rare words, long sentences, and nothing you've already worn out. Read it through and tap
          the words you don't know — looking them up is the whole exercise.
        </p>
        <p className="sb-caption">
          It meets you where you are, and climbs as you do. Words you tap come back later in new
          company.
        </p>
        <button type="button" className="sb-button sb-button--wide" onClick={() => setOpen(true)}>
          Open the passage
        </button>
      </div>
    </Screen>
  );
}
