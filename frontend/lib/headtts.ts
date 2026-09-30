// HeadTTS (Kokoro, local): the TTS switch's default. Its own service on this machine
// (headtts/ in the repo), so the browser calls it directly: no key, nothing leaves it
export const HEADTTS_URL = process.env.NEXT_PUBLIC_HEADTTS_URL ?? "http://localhost:8882";

// HeadTTS never answers when its worker fails, so every call needs its own time limit.
// A sentence takes 0.4-1.4 s, so this only fires when something's broken
const TIMEOUT_MS = 15_000;

export type HeadTtsVoice = "af_heart" | "am_michael";

// word and viseme (mouth shape) timings in ms: for the avatar's lip-sync later
export type HeadTtsSpeech = {
  audio: ArrayBuffer; // WAV, 24 kHz mono
  words: string[];
  wtimes: number[];
  wdurations: number[];
  visemes: string[];
  vtimes: number[];
  vdurations: number[];
};

function fromBase64(base64: string): ArrayBuffer {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return bytes.buffer;
}

export async function synthesizeHeadTts(
  text: string,
  voice: HeadTtsVoice,
  signal: AbortSignal,
): Promise<HeadTtsSpeech> {
  const response = await fetch(`${HEADTTS_URL}/v1/synthesize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: text, voice, language: "en-us", audioEncoding: "wav" }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(`HeadTTS: ${data.error ?? response.status}`);
  }
  return { ...data, audio: fromBase64(data.audio) };
}
