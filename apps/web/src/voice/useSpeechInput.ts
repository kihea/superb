// Speaking an answer instead of typing it. Wraps the browser's own speech
// recognition where it exists (Chrome, Android); everywhere else the games
// simply don't show a microphone.
import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

interface SpeechResultEventLike {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

function recognitionClass(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    | (new () => SpeechRecognitionLike)
    | null;
}

export interface SpeechInput {
  supported: boolean;
  listening: boolean;
  /** Starts listening; every final phrase heard is handed to `onWords`,
   *  already split into lowercase words. */
  start: () => void;
  stop: () => void;
}

export function useSpeechInput(onWords: (words: string[]) => void): SpeechInput {
  const [listening, setListening] = useState(false);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const onWordsRef = useRef(onWords);
  onWordsRef.current = onWords;

  const supported = recognitionClass() !== null;

  const stop = useCallback(() => {
    recogRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Recognition = recognitionClass();
    if (!Recognition) return;
    recogRef.current?.abort();
    const recog = new Recognition();
    recog.lang = "en-US";
    recog.continuous = true;
    recog.interimResults = false;
    recog.maxAlternatives = 1;
    recog.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result.isFinal) continue;
        const words = result[0].transcript
          .toLowerCase()
          .split(/[^a-z']+/)
          .filter(Boolean);
        if (words.length > 0) onWordsRef.current(words);
      }
    };
    recog.onend = () => setListening(false);
    recog.onerror = () => setListening(false);
    recogRef.current = recog;
    recog.start();
    setListening(true);
  }, []);

  useEffect(
    () => () => {
      recogRef.current?.abort();
    },
    [],
  );

  return { supported, listening, start, stop };
}
