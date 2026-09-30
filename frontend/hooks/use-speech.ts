"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { ChatStreamEvent } from "@/lib/api";
import { synthesizeHeadTts, type HeadTtsVoice } from "@/lib/headtts";
import { SentenceSplitter } from "@/lib/sentences";
import { SpeechQueue } from "@/lib/speech-queue";

// until the avatar picks the interviewer - one of HeadTTS's two voices
const VOICE: HeadTtsVoice = "af_heart";

const VOICE_UNAVAILABLE = "The interviewer's voice isn't available, so replies are text only.";

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

  useEffect(() => {
    const context = new AudioContext();
    const queue = new SpeechQueue<AudioBuffer>(
      async (text, signal) => {
        const { audio } = await synthesizeHeadTts(text, VOICE, signal);

        return context.decodeAudioData(audio);
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

    // browsers only allow sound after a click or key press on the page. Coming from the
    // setup page's Start button that's the case; after a reload, the first click is
    const resume = () => void context.resume();
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });

    return () => {
      queue.stop();
      queueRef.current = null;
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
      void context.close();
    };
  }, []);

  const say = useCallback((sentences: string[]) => {
    sentences.forEach((text) => queueRef.current?.add(text));
  }, []);

  const handleEvent = useCallback(
    (event: ChatStreamEvent) => {
      switch (event.event) {
        case "meta": // a new turn
          queueRef.current?.stop();
          splitterRef.current = new SentenceSplitter();
          break;
        case "token":
          say(splitterRef.current.push(event.data.text));
          break;
        case "blocked": {
          // stop at once (a leak: nothing more of that reply), then the in-character refusal
          queueRef.current?.stop();
          const splitter = new SentenceSplitter();
          splitterRef.current = splitter;
          say([...splitter.push(event.data.reply), ...splitter.flush()]);
          break;
        }
        case "done":
          say(splitterRef.current.flush());
          break;
      }
    },
    [say],
  );

  // barge-in, leaving the interview: silence now
  const stop = useCallback(() => queueRef.current?.stop(), []);

  return { speaking, sentence, handleEvent, stop };
}
