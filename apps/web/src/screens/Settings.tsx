// Screen 13, from frame 1u: the one room where options may look like
// options and a number may face the reader. Everything here does something
// -- the paper swatches, the text size and the motion switch all take
// effect immediately and survive a reload.
//
// Two rows from his frame are not here. "Listening time 7 h 12 m of 10 h"
// and "Renews 12 August · £4.99 a month" describe a subscription that does
// not exist in this build; a real-looking bill is a different kind of thing
// from mocked sample data, so the voice row says what is true instead.
import { useEffect, useRef, useState } from "react";
import { Screen } from "../shell/Screen";
import { Link } from "../router/router";
import { useTheme } from "../theme/theme";
import type { Paper } from "../theme/theme";
import { VoiceOrb } from "../components/voice/VoiceOrb";
import type { OrbState } from "../components/voice/VoiceOrb";
import { books } from "../v0mock";
import "./Settings.css";

// Issue #99's other half: "a voice control/preview." The orb on the reading
// page is the control; this is the preview -- a one-line sample of the
// phone's own built-in voice, so choosing it in Settings is not a guess.
// Feature-detected and silently absent where the browser has no
// speechSynthesis, same as anything else here that depends on what the
// device can do.
//
// ADR-039: "voice does not exist yet" as a working feature in this build --
// the reading page's own orb does not actually speak (ReadingScreen.tsx:
// "two words, not a player"). So the line this speaks names the phone's
// voice itself, never what reading in the app will sound like -- this
// previews a real, honest capability of the device, not a promise about
// a feature that is not wired up anywhere else yet.
const PREVIEW_LINE = "This is your phone's own voice.";

function speechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

const PAPERS: { id: Paper; label: string; swatch: string }[] = [
  { id: "oxblood", label: "Oxblood", swatch: "settings-swatch--oxblood" },
  { id: "lilac", label: "Lilac", swatch: "settings-swatch--lilac" },
  { id: "glacier", label: "Glacier", swatch: "settings-swatch--glacier" },
];

const SCALE_KEY = "superb.readerScale";
const MOTION_KEY = "superb.motion";

export function Settings() {
  const { paper, night, setPaper, setNight } = useTheme();
  const [scale, setScale] = useState(() => Number(localStorage.getItem(SCALE_KEY) ?? 1) || 1);
  const [motion, setMotion] = useState(() => localStorage.getItem(MOTION_KEY) !== "off");
  const [voiceState, setVoiceState] = useState<OrbState>("still");
  const voiceSupported = useRef(speechSynthesisSupported()).current;

  useEffect(() => {
    // Leaving the screen mid-sample should not leave the phone talking to an
    // empty room.
    return () => {
      if (voiceSupported) window.speechSynthesis.cancel();
    };
  }, [voiceSupported]);

  function playVoicePreview() {
    if (!voiceSupported || voiceState === "speaking") return;
    const utterance = new SpeechSynthesisUtterance(PREVIEW_LINE);
    utterance.onend = () => setVoiceState("still");
    utterance.onerror = () => setVoiceState("still");
    setVoiceState("speaking");
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  useEffect(() => {
    document.documentElement.style.setProperty("--reader-scale", String(scale));
    localStorage.setItem(SCALE_KEY, String(scale));
  }, [scale]);

  useEffect(() => {
    document.documentElement.setAttribute("data-motion", motion ? "on" : "off");
    localStorage.setItem(MOTION_KEY, motion ? "on" : "off");
  }, [motion]);

  return (
    <Screen title="Settings" back={{ to: "/shelf", label: "Shelf" }}>
      <section className="settings-group">
        <span className="sb-eyebrow">Paper</span>
        <div className="settings-papers">
          {PAPERS.map((choice) => (
            <button
              key={choice.id}
              type="button"
              className={`settings-swatch ${choice.swatch}${
                paper === choice.id && night !== "on" ? " settings-swatch--on" : ""
              }`}
              onClick={() => {
                setPaper(choice.id);
                setNight("off");
              }}
            >
              {choice.label}
            </button>
          ))}
          <button
            type="button"
            className={`settings-swatch settings-swatch--night${night === "on" ? " settings-swatch--on" : ""}`}
            onClick={() => setNight(night === "on" ? "system" : "on")}
          >
            Night
          </button>
        </div>
        {night === "system" && <span className="sb-caption">Following your phone, light or dark.</span>}
      </section>

      <section className="settings-group">
        <span className="sb-eyebrow">Text size</span>
        <div className="settings-size">
          <span className="settings-size__small">Aa</span>
          <input
            type="range"
            min="0.85"
            max="1.35"
            step="0.05"
            value={scale}
            aria-label="Text size"
            onChange={(e) => setScale(Number(e.target.value))}
          />
          <span className="settings-size__large">Aa</span>
        </div>
      </section>

      <div className="settings-rows">
        <div className="settings-row">
          <span className="settings-row__names">
            <span className="settings-row__name">Motion</span>
            <span className="sb-caption">sheets rise; the voice orb turns; nothing else moves</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={motion}
            aria-label="Motion"
            className={`settings-switch${motion ? " settings-switch--on" : ""}`}
            onClick={() => setMotion((on) => !on)}
          >
            <span className="settings-switch__knob" />
          </button>
        </div>

        <div className="settings-row">
          <span className="settings-row__names">
            <span className="settings-row__name">Voice</span>
            <span className="sb-caption">your phone's own</span>
          </span>
          <span className="settings-row__voice-actions">
            {voiceSupported && (
              <button
                type="button"
                className="voice-orb-button"
                data-speaking={voiceState === "speaking"}
                aria-label="Hear a sample of this voice"
                onClick={playVoicePreview}
              >
                <VoiceOrb state={voiceState} size={22} />
              </button>
            )}
            {/* Its own accessible name (rather than the visible "Change")
                so a screen reader still hears what this goes to, now that
                the row itself is no longer one single link (the orb button
                beside it needs its own tap target). */}
            <Link to="/voice" className="sb-list__aside" aria-label="Voice">
              Change
            </Link>
          </span>
        </div>

        <Link to="/sign-in" className="settings-row settings-row--link">
          <span className="settings-row__name">Account</span>
          <span className="sb-list__aside">signed out</span>
        </Link>

        <div className="settings-row">
          <span className="settings-row__name">Credits and licences</span>
          <span className="sb-list__aside">{books.length} texts</span>
        </div>
      </div>

      <Link to="/welcome" className="sb-quiet sb-quiet--centred">
        See the first open again
      </Link>
    </Screen>
  );
}
