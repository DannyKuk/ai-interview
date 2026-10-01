"use client";

import { LoaderCircle, Mic, Square } from "lucide-react";
import { useEffect, useEffectEvent, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MAX_ANSWER_SECONDS, useDictation } from "@/hooks/use-dictation";
import { MAX_MESSAGE_CHARS } from "@/lib/api";
import { useInterviewStore } from "@/lib/store";

type AnswerInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  disabled: boolean;
  onMicStart?: () => void; // barge-in: the interviewer stops talking
  onMicAudio?: (analyser: AnalyserNode | null) => void; // the mic's volume while recording
  onCaption?: (caption: string | null) => void; // the live dictation, null = not recording
};

function clock(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function joined(typed: string, spoken: string): string {
  return [typed.trim(), spoken].filter(Boolean).join(" ").slice(0, MAX_MESSAGE_CHARS);
}

export function AnswerInput({
  value,
  onChange,
  onSend,
  disabled,
  onMicStart,
  onMicAudio,
  onCaption,
}: AnswerInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const reviewBeforeSending = useInterviewStore((state) => state.reviewBeforeSending);
  const setReviewBeforeSending = useInterviewStore((state) => state.setReviewBeforeSending);
  const captions = useInterviewStore((state) => state.captions);
  const text = value.trim();

  // switch off: stop = send the answer. On: it goes into the field to edit and send
  const dictation = useDictation((spoken) => {
    const answer = joined(value, spoken);
    if (reviewBeforeSending) {
      onChange(answer);
    } else {
      onSend(answer);
    }
  });
  const recording = dictation.status === "recording";
  const busy = dictation.status !== "idle"; // starting, recording or transcribing
  const locked = disabled || busy;

  const reportMicAudio = useEffectEvent((analyser: AnalyserNode | null) => onMicAudio?.(analyser));
  useEffect(() => {
    reportMicAudio(dictation.analyser);
    return () => reportMicAudio(null);
  }, [dictation.analyser]);

  const reportCaption = useEffectEvent((caption: string | null) => onCaption?.(caption));
  const caption = recording ? dictation.caption : null;
  useEffect(() => {
    reportCaption(caption);
    return () => reportCaption(null);
  }, [caption]);

  // back into the field when it's usable again (after a reply, or after dictating)
  useEffect(() => {
    if (!locked) textareaRef.current?.focus();
  }, [locked]);

  function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (text && !locked) {
      onSend(text);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter is a new line.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function toggleMic() {
    if (recording) {
      void dictation.stop();
    } else if (dictation.status === "idle") {
      onMicStart?.();
      void dictation.start();
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      {(dictation.status === "transcribing" || (busy && !captions)) && (
        <p className="min-h-10 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          {dictation.status === "transcribing"
            ? "Writing down your answer…"
            : dictation.caption || "Listening…"}
        </p>
      )}
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        maxLength={MAX_MESSAGE_CHARS}
        disabled={locked}
        placeholder="Type your answer, or use the mic… (Enter to send, Shift+Enter for a new line)"
        className="max-h-60"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={recording ? "destructive" : "outline"}
          onClick={toggleMic}
          disabled={
            (disabled && !recording) ||
            dictation.status === "starting" ||
            dictation.status === "transcribing"
          }
          aria-pressed={recording}
          title={recording ? "Stop: I'm done" : "Answer by voice"}
          // the ring grows with the voice: you can see the mic hears you
          style={
            recording
              ? {
                  boxShadow: `0 0 0 ${2 + dictation.level * 8}px color-mix(in oklch, var(--destructive) 30%, transparent)`,
                }
              : undefined
          }
          className="tabular-nums transition-shadow"
        >
          {dictation.status === "transcribing" ? (
            <LoaderCircle className="animate-spin" />
          ) : recording ? (
            <Square />
          ) : (
            <Mic />
          )}
          {recording ? `${clock(dictation.seconds)} / ${clock(MAX_ANSWER_SECONDS)}` : "Speak"}
        </Button>
        <Field orientation="horizontal" className="w-auto gap-2">
          <Switch
            id="review-before-sending"
            size="sm"
            checked={reviewBeforeSending}
            onCheckedChange={setReviewBeforeSending}
          />
          <FieldLabel htmlFor="review-before-sending" className="text-xs font-normal">
            Review before sending
          </FieldLabel>
        </Field>
        <Button type="submit" disabled={locked || !text} className="ml-auto">
          Send
        </Button>
      </div>
      <FieldDescription className="flex justify-between gap-3 text-xs">
        <span>
          {reviewBeforeSending
            ? "When you stop, your spoken answer lands in the box, so you can fix it before you send."
            : "When you stop, your spoken answer is sent right away."}
        </span>
        <span className="shrink-0 whitespace-nowrap tabular-nums">
          {value.length} / {MAX_MESSAGE_CHARS}
        </span>
      </FieldDescription>
      {dictation.error && <p className="text-sm text-destructive">{dictation.error}</p>}
    </form>
  );
}
