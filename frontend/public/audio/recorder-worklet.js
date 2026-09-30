// Runs on the browser's audio thread (AudioWorklet), loaded by URL from useRecorder.
// Turns the mic (usually 48 kHz) into 16 kHz mono for Parakeet and sends it to the page
// in ~100 ms chunks, each with its loudness for the level meter.
// Resampled here, not with new AudioContext({ sampleRate: 16000 }): Firefox refuses to
// connect a 48 kHz mic to a 16 kHz context.

const TARGET_RATE = 16000;
const CHUNK_SAMPLES = TARGET_RATE / 10;

class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // input samples per output sample, e.g. 3 for 48 kHz. `sampleRate` is a worklet global
    this.step = sampleRate / TARGET_RATE;
    this.position = 0; // where we are inside the current output sample
    this.sum = 0;
    this.count = 0;
    this.chunk = new Float32Array(CHUNK_SAMPLES);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0]; // mono: the first channel is enough
    if (!channel) return true;

    for (const sample of channel) {
      // average the input samples that fall into one output sample: a simple low-pass,
      // so high frequencies don't fold back into speech range (aliasing)
      this.sum += sample;
      this.count += 1;
      this.position += 1;
      if (this.position >= this.step) {
        this.position -= this.step;
        this.chunk[this.filled++] = this.sum / this.count;
        this.sum = 0;
        this.count = 0;
        if (this.filled === CHUNK_SAMPLES) this.flush();
      }
    }
    return true; // keep running until the page disconnects the node
  }

  flush() {
    let squares = 0;
    for (const sample of this.chunk) squares += sample * sample;
    const rms = Math.sqrt(squares / CHUNK_SAMPLES);
    // transfer the buffer instead of copying it, then start a new one
    this.port.postMessage({ samples: this.chunk, rms }, [this.chunk.buffer]);
    this.chunk = new Float32Array(CHUNK_SAMPLES);
    this.filled = 0;
  }
}

registerProcessor("recorder", RecorderProcessor);
