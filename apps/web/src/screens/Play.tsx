// The games room. Three doors, each a different kind of practice. The
// mechanics may show themselves here -- tiers, rounds, reveals -- but
// nothing from this room ever follows the reader back to a book.
import { Screen } from "../shell/Screen";
import { useNavigate } from "../router/context";
import "./Play.css";

const GAMES = [
  {
    to: "/play/association",
    name: "Association",
    line: "A word appears. Say what it brings to mind.",
    hint: "type or speak",
  },
  {
    to: "/play/rhyme",
    name: "Rhyme",
    line: "A word appears. Find the ones that ring with it.",
    hint: "type or speak",
  },
  {
    to: "/play/prose",
    name: "Prose",
    line: "A passage composed for you. Rare words, long sentences.",
    hint: "tuned to you",
  },
];

export function Play() {
  const navigate = useNavigate();
  return (
    <Screen title="Play" sunken tabs>
      <div className="play-doors">
        {GAMES.map((game, i) => (
          <button
            key={game.to}
            type="button"
            className="play-door sb-rise"
            style={{ animationDelay: `${i * 60}ms` }}
            onClick={() => navigate(game.to)}
          >
            <span className="play-door__name">{game.name}</span>
            <span className="play-door__line">{game.line}</span>
            <span className="play-door__hint">{game.hint}</span>
          </button>
        ))}
      </div>
    </Screen>
  );
}
