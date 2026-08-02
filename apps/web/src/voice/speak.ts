// The free voice: the device's own speech, spoken plainly about. All of the
// app's talking goes through here so there is exactly one place that knows
// speechSynthesis exists.

export function voiceSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Prefers a local English voice; falls back to whatever the device offers. */
export function pickVoice(): SpeechSynthesisVoice | null {
  if (!voiceSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  const english = voices.filter((v) => v.lang.startsWith("en"));
  return english.find((v) => v.localService) ?? english[0] ?? voices[0] ?? null;
}

/** Says one thing, interrupting anything already being said. */
export function speakOnce(text: string): void {
  if (!voiceSupported() || !text.trim()) return;
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = 0.95;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (voiceSupported()) window.speechSynthesis.cancel();
}
