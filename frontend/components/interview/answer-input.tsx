"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_MESSAGE_CHARS } from "@/lib/api";

type AnswerInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  disabled: boolean;
};

export function AnswerInput({ value, onChange, onSend, disabled }: AnswerInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const text = value.trim();

  useEffect(() => {
    if (!disabled) textareaRef.current?.focus();
  }, [disabled]);

  function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (text && !disabled) {
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

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        maxLength={MAX_MESSAGE_CHARS}
        disabled={disabled}
        placeholder="Type your answer… (Enter to send, Shift+Enter for a new line)"
        className="max-h-60"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {value.length} / {MAX_MESSAGE_CHARS}
        </span>
        <Button type="submit" disabled={disabled || !text}>
          Send
        </Button>
      </div>
    </form>
  );
}
