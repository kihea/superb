// Reading a book aloud with the device's own voice. One block at a time,
// chained, so stopping is instant and the page always knows where the
// voice is. The page stays the interface -- this hook only says which
// block is being spoken; it never owns the scroll or the layout.
import { useCallback, useEffect, useRef, useState } from "react";
import { pickVoice, voiceSupported } from "./speak";

export type ReadAloudState = "still" | "speaking";

export interface ReadAloud {
  supported: boolean;
  state: ReadAloudState;
  /** The block being spoken right now, or null when still. */
  activeBlock: number | null;
  /** Starts reading at a block and continues to the end of the list. */
  start: (fromBlock: number) => void;
  stop: () => void;
}

export function useReadAloud(blocks: string[]): ReadAloud {
  const [state, setState] = useState<ReadAloudState>("still");
  const [activeBlock, setActiveBlock] = useState<number | null>(null);
  // The generation counter makes every start()/stop() cancel stale onend
  // callbacks -- speechSynthesis keeps firing events for utterances queued
  // before a cancel().
  const generation = useRef(0);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  const stop = useCallback(() => {
    generation.current += 1;
    if (voiceSupported()) window.speechSynthesis.cancel();
    setState("still");
    setActiveBlock(null);
  }, []);

  const start = useCallback(
    (fromBlock: number) => {
      if (!voiceSupported()) return;
      generation.current += 1;
      const gen = generation.current;
      window.speechSynthesis.cancel();
      setState("speaking");

      const voice = pickVoice();

      function speakBlock(index: number) {
        if (gen !== generation.current) return;
        const text = blocksRef.current[index];
        if (text === undefined) {
          setState("still");
          setActiveBlock(null);
          return;
        }
        setActiveBlock(index);
        const utterance = new SpeechSynthesisUtterance(text);
        if (voice) utterance.voice = voice;
        utterance.rate = 0.95;
        utterance.onend = () => speakBlock(index + 1);
        utterance.onerror = () => {
          if (gen !== generation.current) return;
          setState("still");
          setActiveBlock(null);
        };
        window.speechSynthesis.speak(utterance);
      }

      speakBlock(Math.max(0, fromBlock));
    },
    [],
  );

  // Leaving the page silences the voice.
  useEffect(() => stop, [stop]);

  return { supported: voiceSupported(), state, activeBlock, start, stop };
}
