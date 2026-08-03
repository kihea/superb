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
import type { Night, Paper } from "../theme/theme";
import { useMotion } from "../theme/motion";
import { VoiceOrb } from "../components/voice/VoiceOrb";
import type { OrbState } from "../components/voice/VoiceOrb";
import {
  chosenVoiceURI,
  listVoices,
  onVoicesReady,
  pickVoice,
  setChosenVoice,
} from "../voice/speak";
import "./Settings.css";

// The orb on the reading page is the control; this is the preview -- a
// one-line sample of the same voice the reader will hear, so choosing it
// here is not a guess. Feature-detected and silently absent where the
// browser has no speechSynthesis.
const PREVIEW_LINE = "This is your phone's own voice, and it reads the books.";

function speechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

const PAPERS: { id: Paper; label: string; swatch: string }[] = [
  { id: "oxblood", label: "Oxblood", swatch: "settings-swatch--oxblood" },
  { id: "lilac", label: "Lilac", swatch: "settings-swatch--lilac" },
  { id: "glacier", label: "Glacier", swatch: "settings-swatch--glacier" },
];

// Frame 4o: light/dark is its own row, a three-way switch beside the paper
// choice rather than a fourth swatch pretending to be a colour. "off"/"on"/
// "system" are theme.ts's own words for the same three states.
const NIGHT_MODES: { id: Night; label: string }[] = [
  { id: "off", label: "Light" },
  { id: "on", label: "Dark" },
  { id: "system", label: "System" },
];

const SCALE_KEY = "superb.readerScale";

export function Settings() {
  const { paper, night, setPaper, setNight } = useTheme();
  const [scale, setScale] = useState(() => Number(localStorage.getItem(SCALE_KEY) ?? 1) || 1);
  const { motion, setMotion } = useMotion();
  const [voiceState, setVoiceState] = useState<OrbState>("still");
  const voiceSupported = useRef(speechSynthesisSupported()).current;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState<string | null>(() => chosenVoiceURI());
  const [voicesOpen, setVoicesOpen] = useState(false);

  useEffect(() => {
    // Chrome hands over its voice list (Google network voices included)
    // only after voiceschanged; ask again once it has.
    const unlisten = onVoicesReady(() => setVoices(listVoices()));
    setVoices(listVoices());
    return unlisten;
  }, []);

  useEffect(() => {
    // Leaving the screen mid-sample should not leave the phone talking to an
    // empty room.
    return () => {
      if (voiceSupported) window.speechSynthesis.cancel();
    };
  }, [voiceSupported]);

  function playVoicePreview(voice?: SpeechSynthesisVoice) {
    if (!voiceSupported) return;
    const utterance = new SpeechSynthesisUtterance(PREVIEW_LINE);
    const picked = voice ?? pickVoice();
    if (picked) utterance.voice = picked;
    utterance.onend = () => setVoiceState("still");
    utterance.onerror = () => setVoiceState("still");
    setVoiceState("speaking");
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function chooseVoice(voice: SpeechSynthesisVoice) {
    setChosenVoice(voice.voiceURI);
    setVoiceURI(voice.voiceURI);
    // Hearing the choice is the confirmation — no toast, no tick.
    playVoicePreview(voice);
  }

  const currentVoice =
    voices.find((v) => v.voiceURI === voiceURI) ??
    (voiceSupported ? (pickVoice() ?? null) : null);

  useEffect(() => {
    document.documentElement.style.setProperty("--reader-scale", String(scale));
    localStorage.setItem(SCALE_KEY, String(scale));
  }, [scale]);

  return (
    <Screen title="Settings" back={{ to: "/", label: "Shelf" }}>
      <section className="settings-group">
        <span className="sb-eyebrow">Paper</span>
        <div className="settings-papers">
          {PAPERS.map((choice) => (
            <button
              key={choice.id}
              type="button"
              className={`settings-swatch ${choice.swatch}${paper === choice.id ? " settings-swatch--on" : ""}`}
              aria-pressed={paper === choice.id}
              onClick={() => setPaper(choice.id)}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <div className="settings-mode" role="group" aria-label="Light or dark">
          {NIGHT_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={`settings-mode__option${night === mode.id ? " settings-mode__option--on" : ""}`}
              aria-pressed={night === mode.id}
              onClick={() => setNight(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>
        {night === "system" && <span className="sb-caption">Following your phone, light or dark.</span>}
      </section>

      <section className="settings-group">
        <div className="settings-size__heading">
          <span className="sb-eyebrow">Text size</span>
          {/* Settings is the one room a number is allowed to face the reader
              (superb-craft's own law). 18px is --fs-600, the passage's own
              base size, times this slider's multiplier, rounded -- a real
              readout, not a picture of one. */}
          <span className="settings-size__value">{Math.round(18 * scale)} pt</span>
        </div>
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
          <button
            type="button"
            className="settings-row__names settings-row__names--button"
            aria-expanded={voicesOpen}
            onClick={() => setVoicesOpen((open) => !open)}
          >
            <span className="settings-row__name">Voice</span>
            <span className="sb-caption">
              {currentVoice
                ? `${currentVoice.name}${voices.length > 1 ? " · tap to change" : ""}`
                : "your phone's own"}
            </span>
          </button>
          <span className="settings-row__voice-actions">
            {voiceSupported && (
              <button
                type="button"
                className="voice-orb-button"
                data-speaking={voiceState === "speaking"}
                aria-label="Hear a sample of this voice"
                onClick={() => playVoicePreview()}
              >
                <VoiceOrb state={voiceState} size={22} />
              </button>
            )}
          </span>
        </div>

        {voicesOpen && voices.length > 0 && (
          <div className="settings-voices sb-fade" role="listbox" aria-label="Reading voice">
            {voices.map((voice) => {
              const on = currentVoice?.voiceURI === voice.voiceURI;
              return (
                <button
                  key={voice.voiceURI}
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={`sb-list__row${on ? " sb-list__row--chosen" : ""}`}
                  onClick={() => chooseVoice(voice)}
                >
                  {voice.name.replace(/^(Microsoft|Google)\s+/, "")}
                  <span className="sb-list__aside">
                    {voice.localService ? "on this device" : "over the network"}
                    {/^Google/.test(voice.name) ? " · Google" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        )}

      </div>

      {/* Attribution the data carries with it -- Wiktionary's share-alike,
         WordNet's copyright notice, CMUdict's licence. This is the one
         room where the credits reach the reader. */}
      <section className="settings-group">
        <span className="sb-eyebrow">About</span>
        <p className="sb-caption">
          The books are out-of-copyright editions from Standard Ebooks and Project Gutenberg, free
          to read and pass on.
        </p>
        <p className="sb-caption">
          Word meanings include text from Wiktionary contributors, used under Creative Commons
          Attribution-ShareAlike 4.0 (or, at your choice, the GNU Free Documentation License).
        </p>
        <p className="sb-caption">
          Word connections are built with WordNet 3.0, Copyright 2006 by Princeton University, used
          with its permissive licence. Rhymes are judged with the CMU Pronouncing Dictionary,
          Copyright Carnegie Mellon University.
        </p>
      </section>

      <Link to="/welcome" className="sb-quiet sb-quiet--centred">
        See the first open again
      </Link>
    </Screen>
  );
}
