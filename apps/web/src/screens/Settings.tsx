// The one room where options may look like options.
//
// The three interchangeable app themes have gone: a brand cannot be a
// preference, and a stranger's first impression of Superb should not depend
// on which swatch somebody happened to tap. What is left is the page itself,
// shown as a live specimen so the controls change something a reader can see
// while they are looking at it — and the doors in and out of Goodreads.
import { useEffect, useRef, useState } from "react";
import { Room } from "../shell/Shell";
import { Link } from "../router/router";
import { LEADS, PAPERS, SIZES, usePageSettings, type Lead, type Paper, type Size } from "../reading/settings";
import { useMotion } from "../theme/motion";
import { VoiceOrb } from "../components/voice/VoiceOrb";
import type { OrbState } from "../components/voice/VoiceOrb";
import { GoodreadsPanel } from "../components/GoodreadsPanel";
import { chosenVoiceURI, listVoices, onVoicesReady, pickVoice, setChosenVoice } from "../voice/speak";
import "./Settings.css";

// The orb on the reading page is the control; this is the preview — a
// one-line sample of the same voice the reader will hear, so choosing it
// here is not a guess. Feature-detected and silently absent where the
// browser has no speechSynthesis.
const PREVIEW_LINE = "This is your device's own voice. Superb uses it to read a page aloud.";

function speechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** One segmented control, used for all three page choices. */
function Segments<T extends string>({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onPick: (id: T) => void;
}) {
  return (
    <div className="settings__segments">
      <span className="eyebrow">{label}</span>
      <div className="settings__segment-row" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`settings__segment${value === option.id ? " settings__segment--on" : ""}`}
            aria-pressed={value === option.id}
            onClick={() => onPick(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Switch({
  name,
  note,
  on,
  onFlip,
}: {
  name: string;
  note: string;
  on: boolean;
  onFlip: () => void;
}) {
  return (
    <button type="button" className="settings__switch-row" role="switch" aria-checked={on} onClick={onFlip}>
      <span className="settings__switch-names">
        <span className="settings__switch-name">{name}</span>
        <span className="settings__switch-note">{note}</span>
      </span>
      <span className={`settings__switch${on ? " settings__switch--on" : ""}`} aria-hidden="true">
        <span className="settings__knob" />
      </span>
    </button>
  );
}

export function Settings() {
  const { settings, set } = usePageSettings();
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
    voices.find((v) => v.voiceURI === voiceURI) ?? (voiceSupported ? (pickVoice() ?? null) : null);

  return (
    <Room width="narrow">
      <div className="room__head">
        <h1 className="mark">Settings</h1>
      </div>

      {/* The page, set the way the reader has set it. Every control below
          changes this paragraph while they are looking at it. */}
      <section className="settings__group">
        <span className="eyebrow">The page</span>
        <div
          className="settings__specimen"
          style={{
            fontSize: `${SIZES[settings.size].px}px`,
            lineHeight: LEADS[settings.lead].value,
            textAlign: settings.justify ? "justify" : "left",
          }}
        >
          <p>
            The Count met me at the door with a courtesy so{" "}
            <span className="settings__kept">obsequious</span> that it was itself a kind of insolence,
            and led me through a great hall where a lamp burned with no visible means of being fed.
          </p>
        </div>

        <div className="settings__controls">
          <Segments<Paper>
            label="paper"
            value={settings.paper}
            options={PAPERS}
            onPick={(id) => set("paper", id)}
          />
          <Segments<Size>
            label="text size"
            value={settings.size}
            options={(Object.keys(SIZES) as Size[]).map((id) => ({ id, label: SIZES[id].label }))}
            onPick={(id) => set("size", id)}
          />
          <Segments<Lead>
            label="line spacing"
            value={settings.lead}
            options={(Object.keys(LEADS) as Lead[]).map((id) => ({ id, label: LEADS[id].label }))}
            onPick={(id) => set("lead", id)}
          />
        </div>
      </section>

      <div className="settings__switches">
        <Switch
          name="Justify the page"
          note="hyphenate words and straighten the right edge"
          on={settings.justify}
          onFlip={() => set("justify", !settings.justify)}
        />
        <Switch
          name="Dim what is ahead"
          note="the page you read stays bright, the rest goes dim"
          on={settings.focus}
          onFlip={() => set("focus", !settings.focus)}
        />
        <Switch
          name="Read aloud turns the page"
          note="the page keeps up with the voice, so you do not have to scroll"
          on={settings.followPage}
          onFlip={() => set("followPage", !settings.followPage)}
        />
        <Switch
          name="Motion"
          note="animate page turns, book covers and the read-aloud button"
          on={motion}
          onFlip={() => setMotion((on) => !on)}
        />
      </div>

      <section className="settings__group">
        <span className="eyebrow">Voice</span>
        <div className="settings__voice">
          <button
            type="button"
            className="settings__voice-name"
            aria-expanded={voicesOpen}
            onClick={() => setVoicesOpen((open) => !open)}
          >
            {currentVoice
              ? `${currentVoice.name}${voices.length > 1 ? " · tap to change" : ""}`
              : "your device's own"}
          </button>
          {voiceSupported && (
            <button
              type="button"
              className="settings__voice-orb"
              data-speaking={voiceState === "speaking"}
              aria-label="Hear a sample of this voice"
              onClick={() => playVoicePreview()}
            >
              <VoiceOrb state={voiceState} size={22} />
            </button>
          )}
        </div>
        {voicesOpen && voices.length > 0 && (
          <div className="settings__voices enter" role="listbox" aria-label="Reading voice">
            {voices.map((voice) => {
              const on = currentVoice?.voiceURI === voice.voiceURI;
              return (
                <button
                  key={voice.voiceURI}
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={`settings__voice-option${on ? " settings__voice-option--on" : ""}`}
                  onClick={() => chooseVoice(voice)}
                >
                  {voice.name.replace(/^(Microsoft|Google)\s+/, "")}
                  <span className="meta">
                    {voice.localService ? "on this device" : "over the network"}
                    {/^Google/.test(voice.name) ? " · Google" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <GoodreadsPanel />

      {/* Attribution the data carries with it — Wiktionary's share-alike,
          WordNet's copyright notice, CMUdict's licence. This is the one room
          where the credits reach the reader. */}
      <section className="settings__group">
        <span className="eyebrow">Credits</span>
        <p className="settings__credit">
          The books are out-of-copyright editions from Standard Ebooks and Project Gutenberg, free to
          read and pass on, and each book's description is Standard Ebooks' own, dedicated to the
          public domain.
        </p>
        <p className="settings__credit">
          Word meanings include text from Wiktionary contributors, used under Creative Commons
          Attribution-ShareAlike 4.0 (or, at your choice, the GNU Free Documentation License).
        </p>
        <p className="settings__credit">
          Word connections are built with WordNet 3.0, Copyright 2006 by Princeton University, used
          with its permissive licence. Rhymes are judged with the CMU Pronouncing Dictionary,
          Copyright Carnegie Mellon University.
        </p>
      </section>

      <Link to="/welcome" className="btn btn--quiet settings__replay">
        Show the welcome screen again
      </Link>
    </Room>
  );
}
