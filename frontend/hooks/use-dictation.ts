"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useRecorder, type RecorderStatus } from "@/hooks/use-recorder";
import { errorMessage, transcribe } from "@/lib/api";

// same as MAX_AUDIO_SECONDS in the backend - the recording stops (and is sent) there
export const MAX_ANSWER_SECONDS = 180;
const CAPTION_EVERY_MS = 1000;
// captions re-transcribe only the end of the answer, so each pass stays ~0.5 s even
// for a long one (a whole 3-minute answer takes ~5.5 s on the CPU)
const CAPTION_WINDOW_SECONDS = 25;

const NOTHING_HEARD = "We didn't catch anything. Please try again or type your answer.";

export type DictationStatus = RecorderStatus | "transcribing";

// mic → live captions while speaking → the final transcript on stop.
// onTranscript gets the whole answer (never ""), once per recording
export function useDictation(onTranscript: (text: string) => void) {
  const [caption, setCaption] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captionBusyRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  });
  // stop() is defined below but the recorder needs it for the length limit
  const stopRef = useRef<() => Promise<void>>(async () => {});

  const recorder = useRecorder({
    maxSeconds: MAX_ANSWER_SECONDS,
    onMaxLength: () => void stopRef.current(),
  });
  const { status, audioSoFar, start: startRecorder, stop: stopRecorder } = recorder;

  // live captions: about once a second, the last 25 s again. A pass that's still
  // running is not doubled up; a missed caption doesn't matter, the final pass counts
  useEffect(() => {
    if (status !== "recording") return;
    const controller = new AbortController();
    const timer = setInterval(async () => {
      if (captionBusyRef.current) return;
      captionBusyRef.current = true;
      try {
        const text = await transcribe(audioSoFar(CAPTION_WINDOW_SECONDS), controller.signal);
        if (!controller.signal.aborted) setCaption(text);
      } catch {
        // aborted on stop, or one failed pass: the next one tries again
      } finally {
        captionBusyRef.current = false;
      }
    }, CAPTION_EVERY_MS);
    // runs when the recording stops (or the component unmounts)
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [status, audioSoFar]);

  const start = useCallback(async () => {
    setError(null);
    setCaption("");
    await startRecorder();
  }, [startRecorder]);

  const stop = useCallback(async () => {
    const pcm = stopRecorder();
    setTranscribing(true);
    try {
      const text = await transcribe(pcm);
      if (text) {
        onTranscriptRef.current(text);
      } else {
        setError(NOTHING_HEARD);
      }
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setTranscribing(false);
      setCaption("");
    }
  }, [stopRecorder]);
  useEffect(() => {
    stopRef.current = stop;
  });

  return {
    status: (transcribing ? "transcribing" : status) as DictationStatus,
    caption,
    error: recorder.error ?? error,
    level: recorder.level,
    seconds: recorder.seconds,
    start,
    stop,
  };
}
