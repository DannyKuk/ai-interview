"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useChatStream } from "@/hooks/use-chat-stream";
import type { ChatMessage, ChatRequest } from "@/lib/api";
import { useInterviewStore, useStoreHydrated } from "@/lib/store";

// request for the next interviewer turn: the whole transcript goes along every time
function buildRequest(messages: ChatMessage[]): ChatRequest {
  const { sessionId, settings } = useInterviewStore.getState();
  return {
    session_id: sessionId!,
    messages,
    settings: settings!,
    system_prompt: "zero_shot",
  };
}

export function InterviewChat() {
  const hydrated = useStoreHydrated();
  const messages = useInterviewStore((state) => state.messages);
  const addMessage = useInterviewStore((state) => state.addMessage);
  const { turn, error, send } = useChatStream();
  const router = useRouter();

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const { sessionId, messages } = useInterviewStore.getState();

    if (!sessionId) {
      router.replace("/");
    } else if (messages.length === 0) {
      send(buildRequest([])).then((finished) => {
        if (finished) addMessage({ role: "assistant", content: finished.reply });
      });
    }
  }, [hydrated, router, send, addMessage]);

  if (!hydrated) {
    return <p>Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-3">
        {messages.map((message, index) => (
          <li key={index}>
            <strong>{message.role === "assistant" ? "Interviewer" : "You"}:</strong>{" "}
            {message.content}
          </li>
        ))}
        {turn?.streaming && (
          <li>
            <strong>Interviewer:</strong> {turn.reply || "…"}
          </li>
        )}
      </ol>
      {error && <p>{error}</p>}
    </div>
  );
}
