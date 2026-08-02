// The reader's kept words. Progress as an artifact: each word sits with its
// meaning and the sentence it was met in. No counts anywhere else in the
// app point here; the collection is its own reward.
import { useEffect, useState } from "react";
import { Screen } from "../shell/Screen";
import {
  getKeptSentences,
  getKeptWords,
  unkeepWord,
  type KeptSentence,
  type KeptWord,
} from "../reading/words";
import "./Words.css";

type Status = "loading" | "ready" | "error";

export function Words() {
  const [status, setStatus] = useState<Status>("loading");
  const [words, setWords] = useState<KeptWord[]>([]);
  const [sentences, setSentences] = useState<KeptSentence[]>([]);

  useEffect(() => {
    Promise.all([getKeptWords(), getKeptSentences()])
      .then(([kept, keptSentences]) => {
        setWords([...kept].sort((a, b) => b.keptAt - a.keptAt));
        setSentences([...keptSentences].sort((a, b) => b.keptAt - a.keptAt));
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  function letGo(word: string) {
    void unkeepWord(word)
      .then((kept) => setWords([...kept].sort((a, b) => b.keptAt - a.keptAt)))
      .catch(() => {});
  }

  return (
    <Screen title="Words" sunken tabs>
      {status === "error" && <p className="sb-said">Your words wouldn't open. Try again in a moment.</p>}

      {status === "ready" && words.length === 0 && sentences.length === 0 && (
        <div className="words-empty sb-rise">
          <p className="sb-said">Nothing kept yet.</p>
          <p className="sb-caption">
            While you read, tap a word and keep it. It will wait for you here, with the sentence you
            found it in.
          </p>
        </div>
      )}

      {words.length > 0 && (
        <ul className="words-list">
          {words.map((entry, i) => (
            <li key={entry.word} className="words-item sb-rise" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <div className="words-item__head">
                <span className="words-item__word">{entry.word}</span>
                <button
                  type="button"
                  className="words-item__letgo"
                  aria-label={`Let go of ${entry.word}`}
                  onClick={() => letGo(entry.word)}
                >
                  let go
                </button>
              </div>
              <p className="words-item__meaning">{entry.definition}</p>
              {entry.context && <p className="words-item__context">“{entry.context}”</p>}
            </li>
          ))}
        </ul>
      )}

      {sentences.length > 0 && (
        <div className="words-section">
          <span className="sb-eyebrow">Sentences</span>
          <ul className="words-list">
            {sentences.map((entry) => (
              <li key={entry.text} className="words-item sb-rise">
                <p className="words-item__context">“{entry.text}”</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Screen>
  );
}
