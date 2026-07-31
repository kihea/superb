// Screen 7's second half, from frame 2c: the paid-voice handoff, quieter.
// One orb at reading scale, two choices, no footnote. The passage stays
// visible and dimmed behind it, so this reads as something that happened
// during reading rather than a place you went.
//
// Nothing here synthesises audio -- see v0mock's header.
import { Screen } from "../shell/Screen";
import { useNavigate } from "../router/context";
import { VoiceOrb } from "../components/voice/VoiceOrb";
import { voice } from "../v0mock";
import "./Voice.css";

export function Voice() {
  const navigate = useNavigate();
  return (
    <Screen>
      <div className="voice-behind" aria-hidden="true">
        <p className="sb-passage">{voice.afterSpoken}</p>
        <p className="sb-passage">{voice.spokenParagraph}</p>
      </div>

      <div className="voice-sheet sb-rise">
        <div className="voice-sheet__head">
          <span className="voice-sheet__orb">
            <VoiceOrb state="speaking" size={56} />
          </span>
          <div className="voice-sheet__words">
            <span className="voice-sheet__title">There's a better voice for this.</span>
            <span className="sb-caption">{voice.paidName} · 10 hours a month</span>
          </div>
        </div>

        <p className="sb-said">Your phone keeps reading for free, for as long as you like.</p>

        <div className="voice-sheet__actions">
          <button type="button" className="sb-button sb-button--wide" onClick={() => navigate("/sign-in")}>
            Hear the difference
          </button>
          <button type="button" className="sb-quiet sb-quiet--centred" onClick={() => navigate("/")}>
            Keep this voice
          </button>
        </div>
      </div>
    </Screen>
  );
}
