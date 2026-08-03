// Association. A word appears; the reader types or says what it brings to
// mind, and every offer is judged against the word's own web -- WordNet
// relations and the company words keep in our own library. A strong
// connection fills, a looser one outlines, a stray stays quiet. The end of
// a round shows how you answered next to how you could have, each with the
// way it connects -- the nudge is the lesson.
import { useEffect, useMemo, useRef, useState } from "react";
import { Screen } from "../shell/Screen";
import { ThinkingOrb } from "thinking-orbs";
import {
  TIERS,
  TIER_NAMES,
  judgeAssociation,
  loadAssociationIndex,
  loadAssociations,
  randomPrompt,
  type AssociationIndex,
  type AssociationPrompt,
} from "../content/challenges";
import { loadChallengeGlosses, type BookGlossEntry } from "../content/glosses";
import { keepWord } from "../reading/words";
import { useSpeechInput } from "../voice/useSpeechInput";
import { ROUND_SECONDS, useRoundTimer, useTimedPreference } from "./useRoundTimer";
import "./Challenge.css";

type OfferKind = "strong" | "connected" | "stray";

interface Offer {
  word: string;
  kind: OfferKind;
  /** The plain-language label, when the word sits in the prompt's own top
   *  list: "means the same", "opposite", "a kind of it", ... */
  connection?: string;
}

type Status = "loading" | "ready" | "error";

export function Association() {
  const [status, setStatus] = useState<Status>("loading");
  const [tiers, setTiers] = useState<Record<string, AssociationPrompt[]>>({});
  const [index, setIndex] = useState<AssociationIndex | null>(null);
  const [glosses, setGlosses] = useState<Record<string, BookGlossEntry>>({});
  const [tier, setTier] = useState<string>("3");
  const [prompt, setPrompt] = useState<AssociationPrompt | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [typed, setTyped] = useState("");
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [timed, toggleTimed] = useTimedPreference();
  const secondsLeft = useRoundTimer(timed && status === "ready" && !over, prompt?.word, () =>
    setOver(true),
  );

  useEffect(() => {
    Promise.all([
      loadAssociations(),
      loadAssociationIndex(),
      loadChallengeGlosses().catch(() => ({})),
    ])
      .then(([tierData, indexData, glossData]) => {
        setTiers(tierData);
        setIndex(indexData);
        setGlosses(glossData);
        setPrompt(randomPrompt(tierData["3"] ?? []));
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  const offered = useMemo(() => new Set(offers.map((o) => o.word)), [offers]);

  function offer(word: string) {
    const clean = word.toLowerCase().trim();
    if (!clean || !prompt || !index || offered.has(clean)) return;
    const inTop = prompt.associates.find((a) => a.word === clean);
    if (inTop) {
      setOffers((current) => [...current, { word: clean, kind: "strong", connection: inTop.connection }]);
      return;
    }
    const judgement = judgeAssociation(prompt.word, clean, index);
    if (judgement === "same") return;
    setOffers((current) => [
      ...current,
      { word: clean, kind: judgement === "connected" ? "connected" : "stray" },
    ]);
  }

  const speech = useSpeechInput((words) => words.forEach(offer));

  function newRound(nextTier: string) {
    speech.stop();
    setTier(nextTier);
    setOffers([]);
    setTyped("");
    setOver(false);
    setPrompt(randomPrompt(tiers[nextTier] ?? [], prompt ?? undefined));
  }

  if (status === "loading") {
    return (
      <Screen title="Association" back={{ to: "/play", label: "Play", icon: true }} nav={false}>
        {null}
      </Screen>
    );
  }
  if (status === "error" || !prompt) {
    return (
      <Screen title="Association" back={{ to: "/play", label: "Play", icon: true }} nav={false}>
        <p className="sb-said">The words wouldn't load. Try again in a moment.</p>
      </Screen>
    );
  }

  const connectedCount = offers.filter((o) => o.kind !== "stray").length;

  if (over) {
    const said = new Set(offers.map((o) => o.word));
    const missed = prompt.associates.filter((a) => !said.has(a.word)).slice(0, 6);

    return (
      <Screen title="Association" back={{ to: "/play", label: "Play", icon: true }} nav={false}>
        <div className="challenge-end sb-fade">
          <h2 className="sb-heading">
            {connectedCount === 0
              ? `${prompt.word} stayed a stranger.`
              : `${connectedCount} of yours connected.`}
          </h2>

          {offers.length > 0 && (
            <div className="challenge-said">
              {offers.map((o) => (
                <div key={o.word} className="challenge-said__row">
                  <span
                    className={`sb-chip ${
                      o.kind === "strong"
                        ? "sb-chip--exact"
                        : o.kind === "connected"
                          ? "sb-chip--near"
                          : "sb-chip--quiet"
                    }`}
                  >
                    {o.word}
                  </span>
                  <span className="challenge-said__how">
                    {o.kind === "strong" ? o.connection : o.kind === "connected" ? "connected" : "its own thing"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {missed.length > 0 && (
            <div className="challenge-reveal">
              <span className="sb-eyebrow">You could have said</span>
              <ul className="challenge-reveal__list">
                {missed.map((a) => {
                  const meaning = glosses[a.word]?.definition;
                  return (
                    <li key={a.word} className="challenge-reveal__row">
                      <span className="challenge-reveal__word">{a.word}</span>
                      <span className="challenge-reveal__meaning">
                        {a.connection}
                        {meaning ? ` — ${meaning}` : ""}
                      </span>
                      {meaning && (
                        <button
                          type="button"
                          className="sb-quiet challenge-reveal__keep"
                          onClick={(e) => {
                            (e.currentTarget as HTMLButtonElement).disabled = true;
                            e.currentTarget.textContent = "kept";
                            void keepWord(
                              { word: a.word, definition: meaning, source: "association" },
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
    <Screen title="Association" back={{ to: "/play", label: "Play", icon: true }} nav={false} bare>
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
                o.kind === "strong"
                  ? "sb-chip--exact"
                  : o.kind === "connected"
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
            close
          </span>
          <span className="challenge-key__item">
            <span className="challenge-key__swatch challenge-key__swatch--near" />
            connected
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
          placeholder={`what ${prompt.word} brings to mind`}
          aria-label={`a word connected to ${prompt.word}`}
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
