"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// what the backend's /api/voice/transcribe expects: 16 kHz, mono, 16-bit PCM
export const RECORDING_SAMPLE_RATE = 16000;
const CHUNKS_PER_SECOND = 10; // the worklet sends ~100 ms chunks

type RecorderOptions = {
  maxSeconds?: number;
  onMaxLength?: () => void; // called when the recording reaches maxSeconds: stop it there
};

export type RecorderStatus = "idle" | "starting" | "recording";

type Recording = {
  stream: MediaStream;
  context: AudioContext;
  node: AudioWorkletNode;
};

const MIC_BLOCKED =
  "Microphone access is blocked. Allow it in your browser's address bar, or type your answer.";
const NO_MIC = "No microphone found. You can type your answer instead.";
const MIC_FAILED = "The microphone didn't start. Please try again or type your answer.";

function micError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") return MIC_BLOCKED;
    if (error.name === "NotFoundError" || error.name === "OverconstrainedError") return NO_MIC;
  }
  return MIC_FAILED;
}

// float samples (-1..1) → 16-bit integers. Int16Array uses the machine's byte order,
// which is little-endian on every desktop and phone, as the backend expects
function toPcm16(chunks: Float32Array[]): Int16Array<ArrayBuffer> {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const pcm = new Int16Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    for (const sample of chunk) {
      const clipped = Math.max(-1, Math.min(1, sample));
      pcm[offset++] = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff;
    }
  }
  return pcm;
}

// records the mic as 16 kHz PCM. The audio stays in memory, in this tab only
export function useRecorder({ maxSeconds = Infinity, onMaxLength }: RecorderOptions = {}) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0); // loudness of the last ~100 ms, 0..1
  const [seconds, setSeconds] = useState(0);
  // the mic's live volume while it records, for the avatar's listening (null = not recording)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  // refs, not state: changing them shouldn't re-render (like a plain variable in Vue's
  // setup() that isn't wrapped in ref()), and they survive re-renders
  const recordingRef = useRef<Recording | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const samplesRef = useRef(0);
  // the latest callback, read inside the audio handler
  const onMaxLengthRef = useRef(onMaxLength);
  useEffect(() => {
    onMaxLengthRef.current = onMaxLength;
  });

  const release = useCallback(() => {
    const recording = recordingRef.current;
    recordingRef.current = null;
    if (!recording) return;
    recording.node.port.onmessage = null;
    recording.node.disconnect();
    recording.stream.getTracks().forEach((track) => track.stop()); // the browser's mic light goes off
    void recording.context.close();
    setAnalyser(null);
  }, []);

  const start = useCallback(async () => {
    if (recordingRef.current) return;
    setStatus("starting");
    setError(null);
    chunksRef.current = [];
    samplesRef.current = 0;
    setLevel(0);
    setSeconds(0);

    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      context = new AudioContext();
      await context.audioWorklet.addModule("/audio/recorder-worklet.js");
      const source = context.createMediaStreamSource(stream);
      // no outputs: the node only listens, nothing goes to the speakers
      const node = new AudioWorkletNode(context, "recorder", { numberOfOutputs: 0 });
      node.port.onmessage = (event: MessageEvent<{ samples: Float32Array; rms: number }>) => {
        chunksRef.current.push(event.data.samples);
        samplesRef.current += event.data.samples.length;
        // ~10 updates per second: often enough for a meter and a timer
        setLevel(Math.min(1, event.data.rms * 4));
        const seconds = samplesRef.current / RECORDING_SAMPLE_RATE;
        setSeconds(seconds);
        if (seconds >= maxSeconds && recordingRef.current) onMaxLengthRef.current?.();
      };
      source.connect(node);
      const meter = context.createAnalyser(); // reads the mic, outputs nowhere
      source.connect(meter);
      recordingRef.current = { stream, context, node };
      setAnalyser(meter);
      setStatus("recording");
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close();
      setError(micError(error));
      setStatus("idle");
    }
  }, [maxSeconds]);

  // the answer so far (or only its last seconds), e.g. for live captions. Keeps recording
  const audioSoFar = useCallback((lastSeconds = Infinity) => {
    const chunks = chunksRef.current;
    return toPcm16(chunks.slice(-Math.ceil(lastSeconds * CHUNKS_PER_SECOND)));
  }, []);

  // stops and returns the whole answer
  const stop = useCallback((): Int16Array<ArrayBuffer> => {
    const pcm = toPcm16(chunksRef.current);
    release();
    chunksRef.current = [];
    setStatus("idle");
    setLevel(0);
    return pcm;
  }, [release]);

  // leaving the page while recording: turn the mic off
  useEffect(() => release, [release]);

  return { status, error, level, seconds, analyser, start, stop, audioSoFar };
}
