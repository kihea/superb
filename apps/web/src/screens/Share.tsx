// Screen 14, second half: what the passage looks like when it lands in
// somebody else's messages. The first half -- where share hides -- is not
// here, because frame 1v says it lives on the reading page: "Nothing in the
// reading screen advertises sharing. It appears only when you hold a
// sentence, next to Keep and Hear it." That is components/HoldMenu.tsx, and
// "Send to someone" is the only way to arrive at this screen.
//
// The card is a picture of another app, not a screen of ours. It is here
// because it is the whole reason the hold gesture is worth building.
import { Screen } from "../shell/Screen";
import { shareable } from "../v0mock";
import "./Share.css";

export function Share() {
  return (
    <Screen back={{ to: "/", label: "Back" }}>
      <p className="sb-caption">Sent. This is what arrives.</p>

      <div className="share-thread">
        <span className="share-bubble share-bubble--them">did you ever finish that Washington book</span>

        <div className="share-sent">
          <div className="share-card">
            <div className="share-card__body">
              <span className="share-card__mark">Superb</span>
              <p className="share-card__line">{shareable.sentence}</p>
              <div className="share-card__source">
                <span className="share-card__book">{shareable.book}</span>
                <span className="sb-caption">{shareable.attribution}</span>
              </div>
            </div>
            {/* Frame 1v's own bar, which the first pass dropped. The card is
                one image so it survives any messenger, and the image
                previews the link -- tapping it opens the passage in a
                browser, readable without the app. */}
            <div className="share-card__bar">
              <span className="share-card__cta">Read the rest</span>
              <span className="share-card__link">superb.app/p/8fk2</span>
            </div>
          </div>
          <span className="share-sent__meta">delivered</span>
        </div>

        <span className="share-bubble share-bubble--them">ok that's lovely</span>
      </div>
    </Screen>
  );
}
