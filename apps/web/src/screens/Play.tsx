// Three ways to work a word until it is yours.
//
// The old Play screen was three identical rounded cards, distinguished only by
// the word written on each. Nothing said what a rhyme round felt like against
// a prose round; the room the app is supposed to be fun in was the flattest
// one in it. Now each practice is drawn rather than named — a display running
// the full width across the top of its tile, moving the way the exercise
// itself moves. The name sits under it, where a caption belongs.
import { useNavigate } from "../router/context";
import { Room } from "../shell/Shell";
import { PlayDisplay } from "../components/PlayDisplay";
import type { Practice } from "../design/playDisplay";
import "./Play.css";

const PRACTICES: { id: Practice; to: string; name: string; line: string; hint: string }[] = [
  {
    id: "rhyme",
    to: "/play/rhyme",
    name: "Rhyme",
    line: "A word appears. Give words that rhyme with it. Superb judges the sound, not the spelling.",
    hint: "type or speak",
  },
  {
    id: "association",
    to: "/play/association",
    name: "Association",
    line: "A word appears. Give the words it makes you think of. Superb then shows what you missed.",
    hint: "type or speak",
  },
  {
    id: "prose",
    to: "/play/prose",
    name: "Prose",
    line: "A passage written for you. Tap every word you do not know. That is the whole exercise.",
    hint: "written for you",
  },
];

export function Play() {
  const navigate = useNavigate();
  return (
    <Room>
      <div className="room__head">
        <h1 className="mark">Play</h1>
      </div>
      <p className="play__lede">
        Three ways to practise a word. Nothing you do here changes what you read.
      </p>
      <div className="play__grid">
        {PRACTICES.map((practice) => (
          <button key={practice.id} type="button" className="play__door" onClick={() => navigate(practice.to)}>
            <span className="play__display">
              <PlayDisplay practice={practice.id} cols={44} rows={7} size={9} />
            </span>
            <span className="play__name">{practice.name}</span>
            <span className="play__line">{practice.line}</span>
            <span className="play__hint eyebrow">{practice.hint}</span>
          </button>
        ))}
      </div>
    </Room>
  );
}
