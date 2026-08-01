// Screen 13, from frame 1u: the one room where options may look like
// options and a number may face the reader. Everything here does something
// -- the paper swatches, the text size and the motion switch all take
// effect immediately and survive a reload.
//
// Two rows from his frame are not here. "Listening time 7 h 12 m of 10 h"
// and "Renews 12 August · £4.99 a month" describe a subscription that does
// not exist in this build; a real-looking bill is a different kind of thing
// from mocked sample data, so the voice row says what is true instead.
//
// Three more are gone as of the truthful-alpha checkpoint (PLAN.md §7): the
// Voice row's "Change" link (went to /voice, a paid-upsell screen quoting
// v0mock text), the Account row (went to /sign-in, whose own comment says
// "there is no account system in this build"), and "See the first open
// again" (went to /welcome, whose three mood buttons all do the same
// nothing -- see FirstOpen.tsx). All three routes still exist; nothing in
// production navigation points at them until they are real.
import { useEffect, useRef, useState } from "react";
import { Screen } from "../shell/Screen";
import { useTheme } from "../theme/theme";
import type { Paper } from "../theme/theme";
import { useMotion } from "../theme/motion";
import { VoiceOrb } from "../components/voice/VoiceOrb";
import type { OrbState } from "../components/voice/VoiceOrb";
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

export function Settings() {
  const { paper, night, setPaper, setNight } = useTheme();
  const [scale, setScale] = useState(() => Number(localStorage.getItem(SCALE_KEY) ?? 1) || 1);
  const { motion, setMotion } = useMotion();
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

  return (
    <Screen title="Settings" back={{ to: "/", label: "Reading" }}>
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
        </div>
      </div>

      {/* ADR-008: word meanings are rewritten from Wiktionary, which carries
         a share-alike obligation -- the attribution has to reach a reader
         somewhere, and this is the room for it (data/NOTICE.md:50-55's own
         "the app's About screen ... must credit Wiktionary specifically
         wherever a gloss is shown"). CC BY-SA 4.0's own attribution
         requirements are source, licence, and a note that the work was
         modified -- all three below, each linked rather than named only.
         GFDL is Wiktionary's other permitted licence, but this build does
         not carry GFDL's own licence text anywhere, and offering a choice
         without the terms of one option is weaker than not offering it --
         so only CC BY-SA is named here. Not yet a full credits list per
         book -- Slice 1A ships one book, and its own page already names
         its publisher and licence. */}
      <section className="settings-group">
        <span className="sb-eyebrow">About</span>
        <p className="sb-caption">
          Word meanings include text from{" "}
          <a href="https://www.wiktionary.org/" target="_blank" rel="noreferrer">
            Wiktionary
          </a>{" "}
          contributors, used under{" "}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">
            Creative Commons Attribution-ShareAlike 4.0
          </a>
          . Definitions have been modified: narrowed to one book's own words, and mechanically
          reformatted for capitalization and closing punctuation.
        </p>
      </section>
    </Screen>
  );
}
