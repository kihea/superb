// Screen 9, from frame 3d — the turn-3 design, and the latest: association
// as a puzzle board. Nine tiles; an unsolved one gives away its first
// letter and its length and nothing else. Type a word, press Add, and the
// tile it belongs to lands. A word worth having brings one line of meaning
// with it.
//
// Kihea's note under the frame is the whole design brief: "Wordle's
// bargain, kept quiet: the board tells you exactly how much you don't know
// (first letter, letter count), tiles flip as they land, and a solved word
// gets one line of meaning — the vocabulary payload the puzzle games never
// carry."
//
// This replaced the two turn-2 designs (2e's list and 2f's recital) that
// the track file originally named. Both remain in the design canvas.
import { useState } from "react";
import { Screen } from "../shell/Screen";
import { RARE_TILE_INDEX, associationFields } from "../v0mock";
import type { AssociationField, AssociationWord } from "../v0mock";
import "./Challenge.css";

export function Association() {
  const [field, setField] = useState<AssociationField>(associationFields[0]);
  const [choosing, setChoosing] = useState(false);
  const [solved, setSolved] = useState<string[]>([]);
  const [landed, setLanded] = useState<AssociationWord | null>(null);
  const [typed, setTyped] = useState("");

  function open(next: AssociationField) {
    setField(next);
    setSolved([]);
    setLanded(null);
    setTyped("");
    setChoosing(false);
  }

  function add() {
    const guess = typed.trim().toLowerCase();
    setTyped("");
    if (!guess) return;
    const match = field.words.find((entry) => entry.word === guess && !solved.includes(entry.word));
    if (!match) return;
    setSolved((current) => [...current, match.word]);
    setLanded(match);
  }

  function revealOne() {
    const next = field.words.find((entry) => !solved.includes(entry.word));
    if (!next) return;
    setSolved((current) => [...current, next.word]);
    setLanded(next);
  }

  if (choosing) {
    return (
      <Screen title="Association" back={{ to: "/shelf", label: "Shelf" }}>
        <h2 className="sb-heading sb-heading--sm">Pick a field.</h2>
        <div className="sb-list">
          {associationFields.map((one) => (
            <button
              key={one.name}
              type="button"
              className={`sb-list__row${one.name === field.name ? " sb-list__row--chosen" : ""}`}
              onClick={() => open(one)}
            >
              <span>{one.name}</span>
              <span className="sb-list__aside">{one.tier} · nine words</span>
            </button>
          ))}
        </div>
        <span className="sb-caption">The tier comes with the field — harder fields, rarer words.</span>
      </Screen>
    );
  }

  const done = solved.length === field.words.length;

  return (
    <Screen
      title={field.name}
      back={{ to: "/shelf", label: "Shelf" }}
      trail={
        <span className="board-count">
          {solved.length}/{field.words.length}
        </span>
      }
      bare
    >
      <div className="board">
        <div className="board__grid">
          {field.words.map((entry, i) => {
            const isSolved = solved.includes(entry.word);
            if (isSolved) {
              return (
                <div key={entry.word} className={`tile tile--${entry.link} sb-fade`}>
                  <RelationMark link={entry.link} />
                  <span className="tile__word">{entry.word}</span>
                </div>
              );
            }
            // The rare one keeps even its first letter to itself.
            if (i === RARE_TILE_INDEX) {
              return (
                <div key={entry.word} className="tile tile--rare">
                  <span className="tile__rare">rare</span>
                </div>
              );
            }
            return (
              <div key={entry.word} className="tile tile--blank">
                <span className="tile__letter">{entry.word[0]}</span>
                <span className="tile__length" aria-label={`${entry.word.length} letters`}>
                  {"· ".repeat(entry.word.length).trim()}
                </span>
              </div>
            );
          })}
        </div>

        <div className="board__key">
          <span className="board__legend">
            <span className="board__swatch board__swatch--involves">
              <RelationMark link="involves" />
            </span>
            involves
          </span>
          <span className="board__legend">
            <span className="board__swatch board__swatch--relates">
              <RelationMark link="relates" />
            </span>
            relates
          </span>
          <button type="button" className="sb-quiet board__reveal" onClick={revealOne} disabled={done}>
            Reveal one
          </button>
        </div>

        {landed && (
          <div className="sb-card board__landed sb-fade">
            <span className="sb-eyebrow">Just landed</span>
            <div className="board__landed-row">
              <span className="board__landed-word">{landed.word}</span>
              {landed.meaning && <span className="sb-caption">{landed.meaning}</span>}
            </div>
          </div>
        )}

        {done && (
          <div className="board__settled sb-fade">
            <span className="board__settled-line">The board settles.</span>
            <button type="button" className="sb-quiet" onClick={() => setChoosing(true)}>
              Another field
            </button>
          </div>
        )}
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
          placeholder={`a word from ${field.name.toLowerCase()}`}
          aria-label={`a word from ${field.name.toLowerCase()}`}
        />
        <button type="submit" className="sb-button sb-button--sm">
          Add
        </button>
      </form>
    </Screen>
  );
}

/** Two marks, drawn rather than imported: a link for "involves", a branch
 *  for "relates". The design system's own icon set is not in this repo. */
function RelationMark({ link }: { link: AssociationWord["link"] }) {
  if (link === "involves") {
    return (
      <svg className="relation-mark" viewBox="0 0 14 14" aria-hidden="true">
        <path
          d="M5.5 8.5 8.5 5.5M4.8 9.2a2.4 2.4 0 0 1 0-3.4l1.4-1.4a2.4 2.4 0 0 1 3.4 3.4M9.2 4.8a2.4 2.4 0 0 1 0 3.4l-1.4 1.4a2.4 2.4 0 0 1-3.4-3.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg className="relation-mark" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M4 2.5v9M4 6.5h3.5a2.5 2.5 0 0 1 2.5 2.5v2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="4" cy="2.5" r="1.3" fill="currentColor" />
      <circle cx="10" cy="11.5" r="1.3" fill="currentColor" />
    </svg>
  );
}
