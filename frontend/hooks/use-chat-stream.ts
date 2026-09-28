"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ApiError,
  streamChat,
  type ChatRequest,
  type ChatResponse,
  type ChatStreamEvent,
} from "@/lib/api";

type Usage = Extract<ChatStreamEvent, { event: "usage" }>["data"];

export type StreamedTurn = {
  reply: string;
  streaming: boolean;
  ended: NonNullable<ChatResponse["ended"]> | null; // the interviewer said goodbye
  blocked: boolean;
  usage: Usage | null;
};

export function useChatStream() {
  const [turn, setTurn] = useState<StreamedTurn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

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
      blocked: false,
      usage: null,
    };

    setTurn(current);
    setError(null);

    try {
      for await (const event of streamChat(request, controller.signal)) {
        current = applyEvent(current, event);
        setTurn(current);
      }

      return current;
    } catch (error) {
      // a newer send() already took over - leave its state alone
      if (controllerRef.current !== controller) {
        return null;
      }

      setTurn({ ...current, streaming: false });

      if (!controller.signal.aborted) {
        setError(errorMessage(error));
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
      return { ...turn, ended: event.data.ended ?? null };
    case "token":
      return { ...turn, reply: turn.reply + event.data.text };
    case "blocked":
      return { ...turn, reply: event.data.reply, blocked: true };
    case "usage":
      return { ...turn, usage: event.data };
    case "done":
      return { ...turn, streaming: false };
  }
}

function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Connection lost. Please try again.";
  }
  // 429: the backend says how long to wait in Retry-After
  if (error.retryAfter) {
    return `${error.message} (about ${error.retryAfter}s)`;
  }
  return error.message;
}
