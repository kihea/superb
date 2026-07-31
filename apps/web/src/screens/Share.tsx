// Screen 14, from frame 2k: hold a sentence and a small paper card comes up
// on a scrim with a caret pointing into the sentence it came from. Nothing
// else in the app advertises that this exists.
//
// The second state is what it looks like when it lands somewhere else -- a
// card in someone's messages. That is a picture of another app, not a
// screen of ours, and it is here because it is the whole reason the first
// state is worth building.
import { useState } from "react";
import { Screen } from "../shell/Screen";
import { useNavigate } from "../router/context";
import { shareable } from "../v0mock";
import { VoiceOrb } from "../components/voice/VoiceOrb";
import "./Share.css";

export function Share() {
  const navigate = useNavigate();
  const [state, setState] = useState<"reading" | "menu" | "landed">("menu");

  if (state === "landed") {
    return (
      <Screen back={{ to: "/", label: "Back" }}>
        <div className="share-thread">
          <span className="share-bubble share-bubble--them">did you ever finish that Washington book</span>

          <div className="share-sent">
            <div className="share-card">
              <div className="share-card__head">
                <span className="share-card__mark">Superb</span>
                <span className="sb-eyebrow">a passage</span>
              </div>
              <div className="share-card__body">
                <p className="share-card__line">{shareable.sentence}</p>
                <div className="share-card__source">
                  <span className="share-card__book">{shareable.book}</span>
                  <span className="sb-caption">{shareable.attribution}</span>
                </div>
              </div>
            </div>
            <span className="share-sent__meta">superb.app/p/8fk2 · delivered</span>
          </div>

          <span className="share-bubble share-bubble--them">ok that's lovely</span>
        </div>

        <button type="button" className="sb-quiet sb-quiet--centred" onClick={() => setState("menu")}>
          Back to the page
        </button>
      </Screen>
    );
  }

  return (
    <Screen back={{ to: "/", label: "Back" }}>
      <div className="share-page">
        <p className="sb-passage share-page__quiet">{shareable.before}</p>
        <p
          className={`sb-passage${state === "menu" ? " share-page__held" : ""}`}
          onPointerDown={() => setState("menu")}
        >
          {shareable.sentence}
        </p>
        <p className="sb-passage share-page__quiet">{shareable.after}</p>

        {state === "menu" && (
          <>
            <div className="share-scrim sb-fade" onClick={() => setState("reading")} />
            <div className="share-menu sb-rise">
              <span className="share-menu__caret" aria-hidden="true" />
              <button type="button" className="share-menu__item" onClick={() => setState("reading")}>
                <span>Keep the words</span>
                <span className="sb-list__aside">3 new</span>
              </button>
              <span className="share-menu__rule" />
              <button type="button" className="share-menu__item" onClick={() => navigate("/voice")}>
                <span>Hear it</span>
                <span className="share-menu__orb">
                  <VoiceOrb size={18} />
                </span>
              </button>
              <span className="share-menu__rule" />
              <button
                type="button"
                className="share-menu__item share-menu__item--brand"
                onClick={() => setState("landed")}
              >
                <span>Send to someone</span>
                <span className="sb-list__aside">as a card</span>
              </button>
            </div>
          </>
        )}
      </div>

      {state === "reading" && (
        <span className="sb-caption share-hint">hold a sentence · nothing else advertises this</span>
      )}
    </Screen>
  );
}
