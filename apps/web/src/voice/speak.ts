// The free voice: the device's own speech, spoken plainly about. All of the
// app's talking goes through here so there is exactly one place that knows
// speechSynthesis exists.
//
// The reader may choose which voice does the reading. The list is whatever
// the device offers — on Chrome and Android that includes the Google
// network voices — and the choice is remembered by voiceURI. A remembered
// voice that has left the device (a sync change, a different browser) falls
// back to the old preference order rather than to silence.

const VOICE_KEY = "superb.voiceURI";

export function voiceSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Every voice that speaks English, the device's own first, then the
 *  network ones (Google's arrive here on Chrome), each group A to Z. */
export function listVoices(): SpeechSynthesisVoice[] {
  if (!voiceSupported()) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith("en"))
    .sort((a, b) =>
      a.localService === b.localService
        ? a.name.localeCompare(b.name)
        : a.localService
          ? -1
          : 1,
    );
}

/** Chrome fills getVoices() asynchronously; this calls back once real
 *  voices exist (immediately when they already do). Returns an un-listener. */
export function onVoicesReady(callback: () => void): () => void {
  if (!voiceSupported()) return () => {};
  if (window.speechSynthesis.getVoices().length > 0) {
    callback();
    return () => {};
  }
  const handler = () => callback();
  window.speechSynthesis.addEventListener("voiceschanged", handler);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", handler);
}

export function chosenVoiceURI(): string | null {
  try {
    return window.localStorage.getItem(VOICE_KEY);
  } catch {
    return null;
  }
}

export function setChosenVoice(uri: string | null): void {
  try {
    if (uri) window.localStorage.setItem(VOICE_KEY, uri);
    else window.localStorage.removeItem(VOICE_KEY);
  } catch {
    // Private browsing: the choice lasts the session through pickVoice's
    // own read of getVoices(), and that is the best that can be done.
  }
}

/** The chosen voice; otherwise a local English voice; otherwise whatever
 *  the device offers. */
export function pickVoice(): SpeechSynthesisVoice | null {
  if (!voiceSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  const chosen = chosenVoiceURI();
  if (chosen) {
    const found = voices.find((v) => v.voiceURI === chosen);
    if (found) return found;
  }
  const english = voices.filter((v) => v.lang.startsWith("en"));
  return english.find((v) => v.localService) ?? english[0] ?? voices[0] ?? null;
}

/** Says one thing, interrupting anything already being said. `voice`
 *  overrides the remembered choice — the Settings list previews with it. */
export function speakOnce(text: string, voice?: SpeechSynthesisVoice): void {
  if (!voiceSupported() || !text.trim()) return;
  const utterance = new SpeechSynthesisUtterance(text);
  const picked = voice ?? pickVoice();
  if (picked) utterance.voice = picked;
  utterance.rate = 0.95;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (voiceSupported()) window.speechSynthesis.cancel();
}
