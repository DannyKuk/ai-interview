"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AnswerInput } from "@/components/interview/answer-input";
import { Button, buttonVariants } from "@/components/ui/button";
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
  const ended = useInterviewStore((state) => state.ended);
  const addMessage = useInterviewStore((state) => state.addMessage);
  const endInterview = useInterviewStore((state) => state.endInterview);
  const { turn, error, send, stop } = useChatStream();
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const { sessionId, messages } = useInterviewStore.getState();

    if (!sessionId) {
      router.replace("/");
    } else if (messages.length === 0) {
      send(buildRequest([])).then((finished) => {
        if (finished && !finished.blocked) {
          addMessage({ role: "assistant", content: finished.reply });
        }
      });
    }
  }, [hydrated, router, send, addMessage]);

  async function answer(text: string) {
    const answerMessage: ChatMessage = { role: "user", content: text };
    setPending(text);
    setDraft("");

    const finished = await send(buildRequest([...messages, answerMessage]));
    setPending(null);

    if (finished && !finished.blocked) {
      addMessage(answerMessage);
      addMessage({ role: "assistant", content: finished.reply });
      if (finished.ended) {
        endInterview(finished.ended);
      }
    } else {
      // blocked or failed: keep it out of the history
      setDraft(text);
    }
  }

  function leave() {
    stop();
    endInterview("candidate_left");
    router.push("/results");
  }

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

        {pending && (
          <li>
            <strong>You:</strong> {pending}
          </li>
        )}

        {(turn?.streaming || turn?.blocked) && (
          <li>
            <strong>Interviewer:</strong> {turn.reply || "…"}
          </li>
        )}
      </ol>
      {error && <p>{error}</p>}
      {ended ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground">The interviewer has left the meeting.</p>
          <Link href="/results" className={buttonVariants()}>
            See your feedback
          </Link>
        </div>
      ) : (
        <AnswerInput
          value={draft}
          onChange={setDraft}
          onSend={answer}
          disabled={messages.length === 0 || !!turn?.streaming}
        />
      )}
      {!ended && (
        <Button variant="destructive" className="self-start" onClick={leave}>
          Leave interview
        </Button>
      )}
    </div>
  );
}
