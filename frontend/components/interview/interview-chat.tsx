"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AnswerInput } from "@/components/interview/answer-input";
import { Button, buttonVariants } from "@/components/ui/button";
import { useChatStream } from "@/hooks/use-chat-stream";
import type { ChatMessage, ChatRequest } from "@/lib/api";
import { useInterviewStore, useStoreHydrated } from "@/lib/store";

// request for the next interviewer turn: the whole transcript goes along every time
function buildRequest(messages: ChatMessage[]): ChatRequest {
  const { sessionId, settings, dev } = useInterviewStore.getState();
  return {
    session_id: sessionId!,
    messages,
    settings: settings!,
    system_prompt: dev!.technique,
    model_settings: dev!.modelSettings,
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

  const firstTurn = useCallback(async () => {
    const finished = await send(buildRequest([]));
    if (finished && !finished.blocked) {
      addMessage({ role: "assistant", content: finished.reply });
    }
  }, [send, addMessage]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const { sessionId, messages, dev } = useInterviewStore.getState();

    // no interview started (or started before the dev settings existed): back to setup
    if (!sessionId || !dev) {
      router.replace("/");
    } else if (messages.length === 0) {
      firstTurn();
    }
  }, [hydrated, router, firstTurn]);

  // a new error (429, backend down, ...) pops up as a toast. The answer is back in the box
  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

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

  // the first turn failed or the role was blocked: nothing to answer yet
  const noQuestion = messages.length === 0 && !turn?.streaming && (!!error || !!turn?.blocked);

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
      {ended ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground">The interviewer has left the meeting.</p>
          <Link href="/results" className={buttonVariants()}>
            See your feedback
          </Link>
        </div>
      ) : noQuestion ? (
        <div className="flex items-center justify-end gap-2">
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Back to setup
          </Link>
          <Button onClick={firstTurn}>Try again</Button>
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
