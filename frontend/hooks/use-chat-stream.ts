"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ApiError,
  errorMessage,
  streamChat,
  type ChatRequest,
  type ChatResponse,
  type ChatStreamEvent,
  type GuardVerdict,
  type PlanProgress,
} from "@/lib/api";

type Usage = Extract<ChatStreamEvent, { event: "usage" }>["data"];

export type StreamedTurn = {
  reply: string;
  streaming: boolean;
  ended: NonNullable<ChatResponse["ended"]> | null; // the interviewer said goodbye
  blocked: NonNullable<ChatResponse["blocked"]> | null; // why the guard stopped it
  hint: NonNullable<ChatResponse["hint"]> | null; // the turn note from the guard's signals
  progress: PlanProgress | null; // the plan question this reply asks
  guard: GuardVerdict | null;
  usage: Usage | null;
  historySignature: string | null; // the server's signature over the transcript + this reply
};

// status: the HTTP status, null when the request never got an answer (network)
export type ChatError = { message: string; status: number | null };

type ChatStreamOptions = {
  // every event as it arrives, e.g. for speaking the reply while it streams
  onEvent?: (event: ChatStreamEvent) => void;
};

export function useChatStream({ onEvent }: ChatStreamOptions = {}) {
  const [turn, setTurn] = useState<StreamedTurn | null>(null);
  const [error, setError] = useState<ChatError | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  // stop the stream when the page is left
  useEffect(() => () => controllerRef.current?.abort(), []);

  // streams one turn. useCallback keeps the same function between renders
  const send = useCallback(async (request: ChatRequest): Promise<StreamedTurn | null> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    let current: StreamedTurn = {
      reply: "",
      streaming: true,
      ended: null,
      blocked: null,
      hint: null,
      progress: null,
      guard: null,
      usage: null,
      historySignature: null,
    };

    setTurn(current);
    setError(null);

    try {
      for await (const event of streamChat(request, controller.signal)) {
        current = applyEvent(current, event);
        setTurn(current);
        onEventRef.current?.(event);
      }

      return current;
    } catch (error) {
      // a newer send() already took over - leave its state alone
      if (controllerRef.current !== controller) {
        return null;
      }

      setTurn({ ...current, streaming: false });

      if (!controller.signal.aborted) {
        setError({
          message: errorMessage(error),
          status: error instanceof ApiError ? error.status : null,
        });
      }

      return null;
    }
  }, []);

  const stop = useCallback(() => controllerRef.current?.abort(), []);

  return { turn, error, send, stop };
}

function applyEvent(turn: StreamedTurn, event: ChatStreamEvent): StreamedTurn {
  switch (event.event) {
    case "meta":
      return {
        ...turn,
        ended: event.data.ended ?? null,
        hint: event.data.hint ?? null,
        progress: event.data.progress ?? null,
        guard: event.data.guard ?? null,
      };
    case "token":
      return { ...turn, reply: turn.reply + event.data.text };
    case "blocked":
      return {
        ...turn,
        reply: event.data.reply,
        blocked: event.data.reason,
        guard: event.data.guard ?? turn.guard,
      };
    case "usage":
      return { ...turn, usage: event.data };
    case "done":
      return {
        ...turn,
        streaming: false,
        historySignature: event.data.history_signature ?? null,
      };
  }
}
