// Runs once at image build: downloads the Kokoro model into transformers.js's cache with
// the same calls and settings as HeadTTS's worker (modules/worker-tts.mjs), so the
// service starts without a download and works offline
import { AutoTokenizer, StyleTextToSpeech2Model } from "@huggingface/transformers";

import config from "./headtts-node.json" with { type: "json" };

const { model, dtype, device } = config.tts;
await StyleTextToSpeech2Model.from_pretrained(model, { dtype, device });
await AutoTokenizer.from_pretrained(model);
console.log(`baked ${model} (${dtype})`);
