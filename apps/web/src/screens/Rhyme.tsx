// Rhyme. A word appears; the reader types or says words that ring with it,
// and every offer is judged by pronunciation -- exact rhymes fill, near
// rhymes outline, everything else stays quiet. The tier row lives on the
// game screen, seven wide, so changing difficulty is one tap rather than a
// door. Nothing here follows the reader back to the Shelf or the page.
//
// The end of a round shows how you answered and how you could have -- the
// nudge is the lesson -- and invites one line that uses two of your own
// rhymes, because a rhyme that survives inside a sentence is the one you
// own.
import { useEffect, useMemo, useRef, useState } from "react";
import { Screen } from "../shell/Screen";
import { ThinkingOrb } from "thinking-orbs";
import {
  TIERS,
  TIER_NAMES,
  describeRhyme,
  judgeRhyme,
  loadPronunciations,
  loadRhymes,
  randomPrompt,
  type Pronunciations,
  type RhymeJudgement,
  type RhymePrompt,
} from "../content/challenges";
import { loadChallengeGlosses, type BookGlossEntry } from "../content/glosses";
import { keepWord } from "../reading/words";
import { useSpeechInput } from "../voice/useSpeechInput";
import { ROUND_SECONDS, useRoundTimer, useTimedPreference } from "./useRoundTimer";
import "./Challenge.css";

interface Offer {
  word: string;
  judgement: RhymeJudgement;
}

type Status = "loading" | "ready" | "error";

export function Rhyme() {
  const [status, setStatus] = useState<Status>("loading");
  const [tiers, setTiers] = useState<Record<string, RhymePrompt[]>>({});
  const [prons, setProns] = useState<Pronunciations>({});
  const [glosses, setGlosses] = useState<Record<string, BookGlossEntry>>({});
  const [tier, setTier] = useState<string>("4");
  const [prompt, setPrompt] = useState<RhymePrompt | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [typed, setTyped] = useState("");
  const [over, setOver] = useState(false);
  const [bar, setBar] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [timed, toggleTimed] = useTimedPreference();
  const secondsLeft = useRoundTimer(timed && status === "ready" && !over, prompt?.word, () =>
    setOver(true),
  );

  useEffect(() => {
    Promise.all([loadRhymes(), loadPronunciations(), loadChallengeGlosses().catch(() => ({}))])
      .then(([tierData, pronData, glossData]) => {
        setTiers(tierData);
        setProns(pronData);
        setGlosses(glossData);
        setPrompt(randomPrompt(tierData["4"] ?? []));
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  const offered = useMemo(() => new Set(offers.map((o) => o.word)), [offers]);

  function offer(word: string) {
    const clean = word.toLowerCase().trim();
    if (!clean || !prompt || offered.has(clean)) return;
    const judgement = judgeRhyme(prompt.word, clean, prons);
    if (judgement === "same") return;
    setOffers((current) => [...current, { word: clean, judgement }]);
  }

  const speech = useSpeechInput((words) => words.forEach(offer));

  function newRound(nextTier: string) {
    speech.stop();
    setTier(nextTier);
    setOffers([]);
    setTyped("");
    setBar("");
    setOver(false);
    setPrompt(randomPrompt(tiers[nextTier] ?? [], prompt ?? undefined));
  }

  if (status === "loading") {
    return (
      <Screen title="Rhyme" back={{ to: "/play", label: "Play", icon: true }}>
        {null}
      </Screen>
    );
  }
  if (status === "error" || !prompt) {
    return (
      <Screen title="Rhyme" back={{ to: "/play", label: "Play", icon: true }}>
        <p className="sb-said">The rhymes did not load. Try again in a moment.</p>
      </Screen>
    );
  }

  const exactFound = offers.filter((o) => o.judgement === "exact");
  const nearFound = offers.filter((o) => o.judgement === "near");

  if (over) {
    const said = new Set(offers.map((o) => o.word));
    const missedExact = prompt.exact.filter((r) => !said.has(r.word)).slice(0, 6);
    const missedNear = prompt.near.filter((r) => !said.has(r.word)).slice(0, 3);
    const own = [...exactFound, ...nearFound].map((o) => o.word);
    const barWords = bar
      .toLowerCase()
      .split(/[^a-z']+/)
      .filter(Boolean);
    const barUses = own.filter((word) => barWords.includes(word));
    const barLands = barUses.length >= 2;

    return (
      <Screen title="Rhyme" back={{ to: "/play", label: "Play", icon: true }}>
        <div className="challenge-end sb-fade">
          <h2 className="sb-heading">
            {exactFound.length === 0 && nearFound.length === 0
              ? `${prompt.word} kept its secrets.`
              : `${exactFound.length} exact, ${nearFound.length} near.`}
          </h2>

          {offers.length > 0 && (
            <div className="sb-chips">
              {offers.map((o) => (
                <span
                  key={o.word}
                  className={`sb-chip ${
                    o.judgement === "exact"
                      ? "sb-chip--exact"
                      : o.judgement === "near"
                        ? "sb-chip--near"
                        : "sb-chip--quiet"
                  }`}
                >
                  {o.word}
                </span>
              ))}
            </div>
          )}

          {(missedExact.length > 0 || missedNear.length > 0) && (
            <div className="challenge-reveal">
              <span className="sb-eyebrow">You could have said</span>
              <ul className="challenge-reveal__list">
                {[...missedExact, ...missedNear].map((r) => {
                  const meaning = glosses[r.word]?.definition;
                  const ring = describeRhyme(prompt.word, r.word, prons);
                  return (
                    <li key={r.word} className="challenge-reveal__row">
                      <span className="challenge-reveal__word">{r.word}</span>
                      {(ring || meaning) && (
                        <span className="challenge-reveal__meaning">
                          {ring}
                          {ring && meaning ? " · " : ""}
                          {meaning}
                        </span>
                      )}
                      {meaning && (
                        <button
                          type="button"
                          className="sb-quiet challenge-reveal__keep"
                          onClick={(e) => {
                            (e.currentTarget as HTMLButtonElement).disabled = true;
                            e.currentTarget.textContent = "kept";
                            void keepWord(
                              { word: r.word, definition: meaning, source: "rhyme" },
                              Date.now(),
                            ).catch(() => {});
                          }}
                        >
                          keep
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {own.length >= 2 && (
            <div className="challenge-bar">
              <span className="sb-eyebrow">One line, two of your rhymes</span>
              <textarea
                className="sb-answer__field challenge-bar__field"
                rows={2}
                value={bar}
                onChange={(e) => setBar(e.target.value)}
                placeholder={`something with ${own[0]} and ${own[1]}…`}
              />
              {barLands && <p className="sb-caption challenge-bar__landed sb-fade">That line works.</p>}
            </div>
          )}

          <div className="challenge-end__actions">
            <button type="button" className="sb-button sb-button--wide" onClick={() => newRound(tier)}>
              Another word
            </button>
          </div>
        </div>
      </Screen>
    );
  }

  return (
    <Screen title="Rhyme" back={{ to: "/play", label: "Play", icon: true }} bare>
      <div className="sb-tiers">
        {TIERS.map((t) => (
          <button
            key={t}
            type="button"
            className={`sb-tier${t === tier ? " sb-tier--on" : ""}`}
            onClick={() => newRound(t)}
          >
            {TIER_NAMES[t]}
          </button>
        ))}
        <span className="sb-tiers__gap" />
        <button
          type="button"
          className={`sb-tier challenge-timer${timed ? " sb-tier--on" : ""}`}
          aria-pressed={timed}
          onClick={toggleTimed}
        >
          {timed ? `0:${String(secondsLeft).padStart(2, "0")}` : "Timer"}
        </button>
      </div>

      {timed && (
        <div className="challenge-timer-track" aria-hidden="true">
          <span
            className="challenge-timer-track__left"
            style={{ width: `${(secondsLeft / ROUND_SECONDS) * 100}%` }}
          />
        </div>
      )}

      <div className="challenge-board">
        <span className="challenge-seed">{prompt.word}</span>

        <div className="sb-chips">
          {offers.map((o) => (
            <span
              key={o.word}
              className={`sb-chip ${
                o.judgement === "exact"
                  ? "sb-chip--exact"
                  : o.judgement === "near"
                    ? "sb-chip--near"
                    : "sb-chip--quiet"
              } sb-fade`}
            >
              {o.word}
            </span>
          ))}
        </div>

        <div className="challenge-key">
          <span className="challenge-key__item">
            <span className="challenge-key__swatch challenge-key__swatch--exact" />
            exact
          </span>
          <span className="challenge-key__item">
            <span className="challenge-key__swatch challenge-key__swatch--near" />
            near
          </span>
        </div>
      </div>

      <form
        className="sb-answer"
        onSubmit={(e) => {
          e.preventDefault();
          offer(typed);
          setTyped("");
          inputRef.current?.focus();
        }}
      >
        {speech.supported && (
          <button
            type="button"
            className="sb-answer__mic"
            aria-label={speech.listening ? "Stop listening" : "Say your answers"}
            data-listening={speech.listening}
            onClick={() => (speech.listening ? speech.stop() : speech.start())}
          >
            <ThinkingOrb state={speech.listening ? "solving" : "composing"} size={20} />
          </button>
        )}
        <input
          ref={inputRef}
          className="sb-answer__field"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={`rhymes with ${prompt.word}`}
          aria-label={`a word that rhymes with ${prompt.word}`}
          autoCapitalize="none"
          autoCorrect="off"
        />
        <button type="submit" className="sb-button sb-button--sm">
          Add
        </button>
        <button type="button" className="sb-quiet" onClick={() => setOver(true)}>
          Enough
        </button>
      </form>
    </Screen>
  );
}
