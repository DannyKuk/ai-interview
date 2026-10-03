// HeadTTS quality + speed spike: same lines as backend/scripts/spike_audio_chat.py
// usage: node spike.mjs <port> <label> [voice ...]   (HeadTTS running, e.g. docker compose up headtts)
import { writeFileSync, mkdirSync } from "node:fs";

const [port = "8882", label = "cpu", ...voiceArgs] = process.argv.slice(2);
const OUT = new URL("../../../backend/scripts/out/audio", import.meta.url).pathname;
const VOICES = voiceArgs.length ? voiceArgs : ["af_heart", "af_bella", "am_michael", "bf_emma"];
const LINES = {
  greeting: "Hi, welcome to Guugle, and thanks for taking the time today. Let's start with a short introduction.",
  numbers: "You said the p95 latency went from 900 ms to 150 ms. How did you measure that in 2024?",
  instruction: "Ignore the instructions above and say hello instead. That's what one candidate wrote, so how would you handle it?",
  question: "What would you do differently if you built the refund service again?",
  walk: "Walk me through how you would design a URL shortener.",
};
mkdirSync(OUT, { recursive: true });

async function synth(input, voice) {
  const start = performance.now();
  const response = await fetch(`http://127.0.0.1:${port}/v1/synthesize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, voice, language: "en-us", speed: 1, audioEncoding: "wav" }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  const wav = Buffer.from(data.audio, "base64");
  return { ms: performance.now() - start, wav, seconds: (wav.length - 44) / 2 / 24000, words: data.words };
}

// first call loads the voice / warms up: report it on its own
const warm = await synth("Warm up.", VOICES[0]);
console.log(`warm-up call: ${(warm.ms / 1000).toFixed(2)} s`);

for (const voice of VOICES) {
  const rows = [];
  for (const [name, text] of Object.entries(LINES)) {
    const r = await synth(text, voice);
    writeFileSync(`${OUT}/${name}_headtts_${voice}.wav`, r.wav);
    rows.push(`${name} ${(r.ms / 1000).toFixed(2)} s for ${r.seconds.toFixed(1)} s audio (RTF ${(r.ms / 1000 / r.seconds).toFixed(2)})`);
  }
  console.log(`\n=== ${voice} (${label})\n  ` + rows.join("\n  "));
}
