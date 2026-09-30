"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { speak, type ChatStreamEvent, type SpeakRequest } from "@/lib/api";
import { synthesizeHeadTts, type HeadTtsVoice } from "@/lib/headtts";
import { SentenceSplitter } from "@/lib/sentences";
import { SpeechQueue } from "@/lib/speech-queue";
import { useInterviewStore } from "@/lib/store";

type Engine = "gemini" | "headtts";

// until the avatar picks the interviewer - the same person in both engines
const VOICE: { headtts: HeadTtsVoice; gemini: SpeakRequest["voice"] } = {
  headtts: "af_heart",
  gemini: "Kore",
};
// Gemini's raw PCM: 24 kHz mono 16-bit (backend services/tts.py)
const GEMINI_SAMPLE_RATE = 24000;
// Gemini takes ~1.5 s per sentence: shorter ones go out with the next
const GEMINI_MIN_CHARS = 20;

const VOICE_UNAVAILABLE = "The interviewer's voice isn't available, so replies are text only.";
const SWITCHED_TO_LOCAL =
  "The cloud voice isn't available, so the interview goes on with the local one.";

function pcmToBuffer(context: AudioContext, pcm: ArrayBuffer): AudioBuffer {
  const samples = new Int16Array(pcm);
  const buffer = context.createBuffer(1, samples.length, GEMINI_SAMPLE_RATE);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 0x8000;
  return buffer; // the context resamples it to its own rate when it plays
}

// plays one clip; barge-in (signal) cuts it off
function playBuffer(
  context: AudioContext,
  buffer: AudioBuffer,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => resolve();
    signal.addEventListener(
      "abort",
      () => {
        source.onended = null;
        source.stop();
        reject(signal.reason);
      },
      { once: true },
    );
    source.start();
  });
}

// speaks the interviewer's replies as they stream in: sentence by sentence
export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const [sentence, setSentence] = useState<string | null>(null); // the one playing now
  const queueRef = useRef<SpeechQueue<AudioBuffer> | null>(null);
  const splitterRef = useRef(new SentenceSplitter());
  const warnedRef = useRef(false);
  // barge-in: quiet for the rest of this turn, even if more of the reply streams in
  const silencedRef = useRef(false);
  const engineRef = useRef<Engine | null>(null);
  const engine = useCallback((): Engine => {
    engineRef.current ??= useInterviewStore.getState().cloudVoice ? "gemini" : "headtts";
    return engineRef.current;
  }, []);

  useEffect(() => {
    const context = new AudioContext();

    const headtts = async (text: string, signal: AbortSignal) => {
      const { audio } = await synthesizeHeadTts(text, VOICE.headtts, signal);

      return context.decodeAudioData(audio);
    };

    const gemini = async (text: string, signal: AbortSignal) => {
      const { sessionId, addVoiceCost } = useInterviewStore.getState();
      const { value, cost } = await speak(
        { text, voice: VOICE.gemini, session_id: sessionId! },
        signal,
      );

      addVoiceCost(cost);
      return pcmToBuffer(context, value);
    };

    const queue = new SpeechQueue<AudioBuffer>(
      async (text, signal) => {
        if (engine() === "gemini") {
          try {
            return await gemini(text, signal);
          } catch (error) {
            if (signal.aborted) throw error; // barge-in, not a failure
            // 503, over the cost cap, offline: this sentence and the rest go to HeadTTS.
            // Two sentences can fail at once (one runs ahead): switch + tell only once
            if (engineRef.current === "gemini") {
              engineRef.current = "headtts";
              toast.info(SWITCHED_TO_LOCAL);
            }
          }
        }
        return headtts(text, signal);
      },
      (buffer, signal) => playBuffer(context, buffer, signal),
      {
        onSentence: setSentence,
        onSpeakingChange: (now) => {
          setSpeaking(now);
          if (!now) setSentence(null);
        },

        // HeadTTS down or broken: the reply is still in the transcript. Say it once
        onError: () => {
          if (warnedRef.current) return;
          warnedRef.current = true;
          toast.warning(VOICE_UNAVAILABLE);
        },
      },
    );
    queueRef.current = queue;

    // muting while it talks: quiet at once (a store subscription, not a re-render)
    const unsubscribe = useInterviewStore.subscribe((state, previous) => {
      if (state.muted && !previous.muted) queue.stop();
    });

    // browsers only allow sound after a click or key press on the page. Coming from the
    // setup page's Start button that's the case; after a reload, the first click is
    const resume = () => void context.resume();
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });

    return () => {
      unsubscribe();
      queue.stop();
      queueRef.current = null;
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
      void context.close();
    };
  }, [engine]);

  const newSplitter = useCallback(
    () => new SentenceSplitter(engine() === "gemini" ? GEMINI_MIN_CHARS : 0),
    [engine],
  );

  const say = useCallback((sentences: string[]) => {
    // muted = no TTS call at all (also no Gemini cost). The transcript has the text
    if (silencedRef.current || useInterviewStore.getState().muted) return;
    sentences.forEach((text) => queueRef.current?.add(text));
  }, []);

  const handleEvent = useCallback(
    (event: ChatStreamEvent) => {
      switch (event.event) {
        case "meta": // a new turn
          queueRef.current?.stop();
          silencedRef.current = false;
          splitterRef.current = newSplitter();
          break;
        case "token":
          say(splitterRef.current.push(event.data.text));
          break;
        case "blocked": {
          // stop at once (a leak: nothing more of that reply), then the in-character refusal
          queueRef.current?.stop();
          silencedRef.current = false; // a blocked answer gets its own spoken refusal
          const splitter = newSplitter();
          splitterRef.current = splitter;
          say([...splitter.push(event.data.reply), ...splitter.flush()]);
          break;
        }
        case "done":
          say(splitterRef.current.flush());
          break;
      }
    },
    [say, newSplitter],
  );

  // barge-in (the mic, sending), leaving: silence now and for the rest of this turn
  const stop = useCallback(() => {
    silencedRef.current = true;
    queueRef.current?.stop();
  }, []);

  return { speaking, sentence, handleEvent, stop };
}
