"use client";

import type { TalkingHead } from "@met4citizen/talkinghead";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { speak, type ChatStreamEvent, type SpeakRequest } from "@/lib/api";
import { synthesizeHeadTts, type HeadTtsSpeech, type HeadTtsVoice } from "@/lib/headtts";
import { SentenceSplitter } from "@/lib/sentences";
import { SpeechQueue } from "@/lib/speech-queue";
import { useInterviewStore } from "@/lib/store";

type Engine = "gemini" | "headtts";

// one synthesized sentence: the audio, plus HeadTTS's word and mouth-shape timings for
// the avatar's lips (Gemini has none)
type Clip = { buffer: AudioBuffer; lipsync?: Omit<HeadTtsSpeech, "audio"> };

// until the avatar picks the interviewer - the same person in both engines
const VOICE: { headtts: HeadTtsVoice; gemini: SpeakRequest["voice"] } = {
  headtts: "af_heart",
  gemini: "Kore",
};
// Gemini's raw PCM: 24 kHz mono 16-bit (backend services/tts.py)
const GEMINI_SAMPLE_RATE = 24000;
// Gemini takes ~1.5 s per sentence: shorter ones go out with the next
const GEMINI_MIN_CHARS = 20;
// the avatar's "clip finished" marker should fire at the clip's end. If it doesn't
// (TalkingHead skipped the clip), the queue goes on this long after it should have ended
const AVATAR_END_GRACE_MS = 2000;

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

// plays one clip through the avatar, lip-synced; barge-in (signal) cuts it off.
// Resolves at the clip's end: a marker callback TalkingHead runs on its own clock
function playOnAvatar(head: TalkingHead, clip: Clip, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const durationMs = clip.buffer.duration * 1000;
    const fallback = setTimeout(resolve, durationMs + AVATAR_END_GRACE_MS);

    const finish = () => {
      clearTimeout(fallback);
      resolve();
    };

    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(fallback);
        head.stopSpeaking();
        reject(signal.reason);
      },
      { once: true },
    );

    head.speakAudio({
      audio: clip.buffer,
      words: [], // markers only run when words are set: HeadTTS's real ones replace it
      ...clip.lipsync,
      markers: [finish],
      mtimes: [durationMs],
    });
  });
}

// speaks the interviewer's replies as they stream in: sentence by sentence, through
// the avatar once it's ready (head), plain audio until then
export function useSpeech(head: TalkingHead | null) {
  const [speaking, setSpeaking] = useState(false);
  const [sentence, setSentence] = useState<string | null>(null);
  const queueRef = useRef<SpeechQueue<Clip> | null>(null);
  const headRef = useRef(head);
  const splitterRef = useRef(new SentenceSplitter());
  const warnedRef = useRef(false);
  const silencedRef = useRef(false);
  const engineRef = useRef<Engine | null>(null);
  const engine = useCallback((): Engine => {
    engineRef.current ??= useInterviewStore.getState().cloudVoice ? "gemini" : "headtts";
    return engineRef.current;
  }, []);

  useEffect(() => {
    headRef.current = head;
  }, [head]);

  useEffect(() => {
    const context = new AudioContext();

    const headtts = async (text: string, signal: AbortSignal): Promise<Clip> => {
      const { audio, ...lipsync } = await synthesizeHeadTts(text, VOICE.headtts, signal);

      return { buffer: await context.decodeAudioData(audio), lipsync };
    };

    const gemini = async (text: string, signal: AbortSignal): Promise<Clip> => {
      const { sessionId, addVoiceCost } = useInterviewStore.getState();
      const { value, cost } = await speak(
        { text, voice: VOICE.gemini, session_id: sessionId! },
        signal,
      );

      addVoiceCost(cost);
      return { buffer: pcmToBuffer(context, value) };
    };

    const queue = new SpeechQueue<Clip>(
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
      (clip, signal) => {
        const avatar = headRef.current;
        // its own audio context, still blocked after a reload until the first click:
        // TalkingHead would skip the clip, so play it plainly
        if (avatar?.audioCtx.state === "running") {
          return playOnAvatar(avatar, clip, signal);
        }

        return playBuffer(context, clip.buffer, signal);
      },
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
    const resume = () => {
      void context.resume();
      void headRef.current?.audioCtx.resume();
    };
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
