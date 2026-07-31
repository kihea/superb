// Screen 9. Two different games, both shipped, behind one switch -- 2e and
// 2f are not two drawings of the same idea, and the track says both go in
// v0 so Kihea can play them and decide which survives. The switch is
// labelled in plain words rather than "A" and "B".
//
//   A field  (2e): pick a field, then find the words that belong to it.
//   One word (2f): one word, and you recite anything that touches it.
import { useState } from "react";
import { Screen } from "../shell/Screen";
import { associationFields, associationSeeds } from "../v0mock";
import type { AssociationField, AssociationSeed } from "../v0mock";
import "./Challenge.css";

type Mode = "field" | "seed";

export function Association() {
  const [mode, setMode] = useState<Mode>("field");

  return (
    <Screen title="Association" back={{ to: "/shelf", label: "Shelf" }} bare>
      <div className="assoc-modes" role="group" aria-label="Which game">
        <button
          type="button"
          className={`assoc-mode${mode === "field" ? " assoc-mode--on" : ""}`}
          onClick={() => setMode("field")}
        >
          A field
        </button>
        <button
          type="button"
          className={`assoc-mode${mode === "seed" ? " assoc-mode--on" : ""}`}
          onClick={() => setMode("seed")}
        >
          One word
        </button>
      </div>
      {mode === "field" ? <FieldGame /> : <SeedGame />}
    </Screen>
  );
}

// ── 2e ───────────────────────────────────────────────────────────────────

function FieldGame() {
  const [field, setField] = useState<AssociationField | null>(null);
  const [found, setFound] = useState<string[]>([]);
  const [typed, setTyped] = useState("");

  if (!field) {
    return (
      <div className="assoc-body">
        <h2 className="sb-heading sb-heading--sm">Pick a field.</h2>
        <div className="sb-list">
          {associationFields.map((one) => (
            <button
              key={one.name}
              type="button"
              className="sb-list__row"
              onClick={() => {
                setField(one);
                setFound([]);
              }}
            >
              <span>{one.name}</span>
              <span className="sb-list__aside">
                {one.tier} · {one.words.length + one.looser.length} words
              </span>
            </button>
          ))}
        </div>
        <span className="sb-caption">The tier comes with the field — harder fields, rarer words.</span>
      </div>
    );
  }

  const all = [...field.words, ...field.looser];

  function add() {
    const word = typed.trim().toLowerCase();
    setTyped("");
    if (!word || found.includes(word)) return;
    if (all.includes(word)) setFound((current) => [...current, word]);
  }

  return (
    <>
      <div className="assoc-body">
        <div className="assoc-head">
          <span className="assoc-head__name">{field.name}</span>
          <span className="assoc-head__count">
            {found.length} of {all.length}
          </span>
        </div>

        <div className="assoc-rows">
          {all.map((word, i) => {
            const landed = found.includes(word);
            const last = found[found.length - 1] === word;
            return (
              <div key={word} className={`assoc-row${last ? " sb-fade" : ""}`}>
                <span className="assoc-row__n">{i + 1}</span>
                {landed ? (
                  <>
                    <span className={`assoc-row__word${last ? " assoc-row__word--landed" : ""}`}>{word}</span>
                    {field.looser.includes(word) && <span className="assoc-row__aside">looser link</span>}
                  </>
                ) : (
                  <span className="assoc-row__rule" />
                )}
              </div>
            );
          })}
        </div>

        <button type="button" className="sb-quiet" onClick={() => setField(null)}>
          Another field
        </button>
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
    </>
  );
}

// ── 2f ───────────────────────────────────────────────────────────────────

function SeedGame() {
  const [seed] = useState<AssociationSeed>(associationSeeds[0]);
  const [said, setSaid] = useState<string[]>([]);
  const [typed, setTyped] = useState("");

  // A chain is a pair that links to each other, not only to the seed. It is
  // drawn as a bracket down the margin and counts twice.
  const chained = new Set(
    seed.chains.filter(([a, b]) => said.includes(a) && said.includes(b)).flat(),
  );

  function add() {
    const word = typed.trim().toLowerCase();
    setTyped("");
    if (!word) return;
    const match = Object.keys(seed.links).find((key) => key.toLowerCase() === word);
    if (match && !said.includes(match)) setSaid((current) => [...current, match]);
  }

  const loose = said.filter((word) => !chained.has(word));
  const inChain = said.filter((word) => chained.has(word));

  return (
    <>
      <div className="assoc-seed">
        <span className="sb-eyebrow">{seed.tier}</span>
        <span className="challenge-seed">{seed.word}</span>
      </div>

      <div className="assoc-body">
        {loose.map((word) => (
          <div key={word} className="assoc-link">
            <span className="assoc-row__word">{word}</span>
            <span className="assoc-link__how">{seed.links[word]}</span>
          </div>
        ))}

        {inChain.length > 0 && (
          <div className="assoc-chain sb-fade">
            <span className="assoc-chain__bracket" aria-hidden="true" />
            <div className="assoc-chain__side">
              {inChain.map((word) => (
                <div key={word} className="assoc-link">
                  <span className="assoc-row__word">{word}</span>
                  <span className="assoc-link__how assoc-link__how--chain">chain · ×2</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <span className="sb-caption">keep going — anything that touches it counts</span>
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
          placeholder={`anything that touches ${seed.word}`}
          aria-label={`anything that touches ${seed.word}`}
        />
        <button type="submit" className="sb-button sb-button--sm">
          Add
        </button>
      </form>
    </>
  );
}
