// Screen 8, from frame 2d: the tier row lives on the game screen -- seven
// of them, scrolling sideways, always visible -- so changing difficulty is
// one tap rather than a door. Nothing here follows the reader back to the
// Shelf or the page.
import { useState } from "react";
import { Screen } from "../shell/Screen";
import { rhymeRounds, tiers } from "../v0mock";
import type { Tier } from "../v0mock";
import "./Challenge.css";

export function Rhyme() {
  const [tier, setTier] = useState<Tier>("Uncommon");
  const [found, setFound] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [over, setOver] = useState(false);

  // The round is chosen by tier where one exists, and otherwise by falling
  // back to the first -- v0mock has three rounds, not seven.
  const round = rhymeRounds.find((r) => r.tier === tier) ?? rhymeRounds[0];
  const all = [...round.exact, ...round.near];
  const missing = all.filter((word) => !found.includes(word));

  function changeTier(next: Tier) {
    setTier(next);
    setFound([]);
    setTyped("");
    setOver(false);
  }

  function add() {
    const word = typed.trim().toLowerCase();
    setTyped("");
    if (!word || found.includes(word)) return;
    if (all.includes(word)) setFound((current) => [...current, word]);
  }

  if (over) {
    const missed = missing[0];
    return (
      <Screen title="Rhyme" back={{ to: "/play", label: "Play" }}>
        <div className="challenge-end sb-fade">
          <h2 className="sb-heading">
            {found.length} of {all.length}.
          </h2>
          {missed ? (
            <p className="sb-said">
              Missed: <b>{missed}</b>
              {round.meanings[missed] ? ` — ${round.meanings[missed]}.` : "."}
            </p>
          ) : (
            <p className="sb-said">Every one of them.</p>
          )}
          <div className="challenge-end__actions">
            <button type="button" className="sb-button sb-button--wide" onClick={() => changeTier(tier)}>
              Next round
            </button>
            <a className="sb-quiet sb-quiet--centred" href="/">
              Back to the passage
            </a>
          </div>
        </div>
      </Screen>
    );
  }

  return (
    <Screen title="Rhyme" back={{ to: "/play", label: "Play" }} bare>
      <div className="sb-tiers">
        {tiers.map((name) => (
          <button
            key={name}
            type="button"
            className={`sb-tier${name === tier ? " sb-tier--on" : ""}`}
            onClick={() => changeTier(name)}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="challenge-board">
        <span className="challenge-seed">{round.word}</span>

        <div className="sb-chips">
          {found.map((word) => (
            <span
              key={word}
              className={`sb-chip ${round.exact.includes(word) ? "sb-chip--exact" : "sb-chip--near"} sb-fade`}
            >
              {word}
            </span>
          ))}
          {missing.map((word) => (
            <span key={`blank-${word}`} className="sb-chip sb-chip--blank" aria-hidden="true" />
          ))}
        </div>

        <div className="challenge-key">
          <span className="challenge-key__item">
            <span className="challenge-key__swatch challenge-key__swatch--exact" />
            exact
          </span>
          <span className="challenge-key__item">
            <span className="challenge-key__swatch challenge-key__swatch--near" />
            near
          </span>
        </div>
      </div>

      <form
        className="sb-answer"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className="sb-answer__field"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={`a word that rhymes with ${round.word}`}
          aria-label={`a word that rhymes with ${round.word}`}
        />
        <button type="submit" className="sb-button sb-button--sm">
          Add
        </button>
        <button type="button" className="sb-quiet" onClick={() => setOver(true)}>
          Enough
        </button>
      </form>
    </Screen>
  );
}
