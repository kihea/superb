// Screen 10, from frame 1r: a door, then reading. The challenge is picking
// the shade of prose; once the passage opens it is just a passage, and word
// tap works exactly as it does in a book. Nothing about it follows the
// reader home.
import { useState } from "react";
import { Screen } from "../shell/Screen";
import { elevatedTiers } from "../v0mock";
import type { ElevatedTier } from "../v0mock";
import "./Elevated.css";

export function Elevated() {
  const [open, setOpen] = useState<ElevatedTier | null>(null);
  const [chosen, setChosen] = useState<ElevatedTier>(elevatedTiers[2]);
  const [tapped, setTapped] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  if (done && open) {
    return (
      <Screen title="Elevated passages" back={{ to: "/shelf", label: "Shelf" }}>
        <div className="challenge-end sb-rise">
          <h2 className="sb-heading">You read it.</h2>
          <p className="sb-said">
            {open.name}, all the way through.
            {tapped.length > 0 ? " Words you tapped on the way:" : ""}
          </p>
          {tapped.length > 0 && (
            <div className="elevated-tags">
              {tapped.map((word) => (
                <span key={word} className="elevated-tag">
                  {word}
                </span>
              ))}
            </div>
          )}
          <div className="challenge-end__actions">
            <button
              type="button"
              className="sb-button sb-button--wide"
              onClick={() => {
                setDone(false);
                setOpen(null);
                setTapped([]);
              }}
            >
              {tapped.length > 0 ? "Keep them" : "Another one"}
            </button>
            <a className="sb-quiet sb-quiet--centred" href="/shelf">
              Back to the shelf
            </a>
          </div>
          <span className="sb-caption">Nothing about this follows you home.</span>
        </div>
      </Screen>
    );
  }

  if (open) {
    return (
      <Screen back={{ to: "/elevated", label: "Back" }}>
        <span className="sb-eyebrow">{open.name}</span>
        <div className="elevated-passage">
          {open.passage.map((paragraph, i) => (
            <p key={i} className="sb-passage">
              {paragraph.split(/(\s+)/).map((token, j) =>
                /\s/.test(token) || !/[a-zA-Z]/.test(token) ? (
                  <span key={j}>{token}</span>
                ) : (
                  <button
                    key={j}
                    type="button"
                    className="elevated-word"
                    onClick={() => {
                      const word = token.replace(/[^a-zA-Z-]/g, "").toLowerCase();
                      setTapped((current) =>
                        current.includes(word) ? current : [...current, word],
                      );
                    }}
                  >
                    {token}
                  </button>
                ),
              )}
            </p>
          ))}
        </div>
        <p className="sb-caption">{open.source}</p>
        <button type="button" className="sb-button sb-button--wide" onClick={() => setDone(true)}>
          I read it
        </button>
      </Screen>
    );
  }

  return (
    <Screen back={{ to: "/shelf", label: "Shelf" }}>
      <div className="elevated-door">
        <span className="sb-eyebrow">Elevated passages</span>
        <h2 className="sb-heading">One passage. Rare words, long sentences.</h2>
        <p className="sb-said">
          Read it through. Tap anything you don't know — that isn't cheating, it's the point.
        </p>
      </div>

      <div className="sb-list">
        {elevatedTiers.map((tier) => {
          const written = tier.passage.length > 0;
          return (
            <button
              key={tier.name}
              type="button"
              className={`sb-list__row${tier.name === chosen.name ? " sb-list__row--chosen" : ""}${
                written ? "" : " sb-list__row--quiet"
              }`}
              onClick={() => written && setChosen(tier)}
              disabled={!written}
            >
              <span>{tier.name}</span>
              <span className="sb-list__aside">{written ? tier.hint : "nothing written yet"}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="sb-button sb-button--wide"
        onClick={() => {
          setOpen(chosen);
          setTapped([]);
        }}
      >
        Open the passage
      </button>
    </Screen>
  );
}
