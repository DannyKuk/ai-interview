"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AnswerInput } from "@/components/interview/answer-input";
import { Transcript, TranscriptLine } from "@/components/interview/transcript";
import { Button, buttonVariants } from "@/components/ui/button";
import { useChatStream, type StreamedTurn } from "@/hooks/use-chat-stream";
import type { ChatMessage, ChatRequest } from "@/lib/api";
import { useInterviewStore, useStoreHydrated, type EndReason } from "@/lib/store";

// request for the next interviewer turn: the whole transcript goes along every time,
// the plan unchanged (it's signed) and where we are in it
function buildRequest(messages: ChatMessage[]): ChatRequest {
  const { sessionId, settings, dev, plan, progress } = useInterviewStore.getState();
  return {
    session_id: sessionId!,
    messages,
    settings: settings!,
    system_prompt: dev!.technique,
    model_settings: dev!.modelSettings,
    plan,
    progress,
  };
}

const ENDED_TEXT: Record<EndReason, string> = {
  completed: "That's the end of the interview.",
  candidate_left: "The interviewer has left the meeting.",
  limit_reached: "The interviewer has left the meeting.",
};

export function InterviewChat() {
  const hydrated = useStoreHydrated();
  const messages = useInterviewStore((state) => state.messages);
  const ended = useInterviewStore((state) => state.ended);
  const addMessage = useInterviewStore((state) => state.addMessage);
  const endInterview = useInterviewStore((state) => state.endInterview);
  const recordTurn = useInterviewStore((state) => state.recordTurn);
  const setProgress = useInterviewStore((state) => state.setProgress);
  const plan = useInterviewStore((state) => state.plan);
  const progress = useInterviewStore((state) => state.progress);
  const { turn, error, send, stop } = useChatStream();
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  // a reply that got through: into the transcript, and the plan moves on
  const keepReply = useCallback(
    (finished: StreamedTurn) => {
      addMessage({ role: "assistant", content: finished.reply });
      if (finished.progress) {
        setProgress(finished.progress);
      }
    },
    [addMessage, setProgress],
  );

  const firstTurn = useCallback(async () => {
    const finished = await send(buildRequest([]));
    if (finished) {
      recordTurn(finished); // for the dev panel, blocked turns too
    }
    if (finished && !finished.blocked) {
      keepReply(finished);
    }
  }, [send, keepReply, recordTurn]);

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
    if (error) toast.error(error.message);
  }, [error]);

  async function answer(text: string) {
    const answerMessage: ChatMessage = { role: "user", content: text };
    setPending(text);
    setDraft("");

    const finished = await send(buildRequest([...messages, answerMessage]));
    setPending(null);
    if (finished) {
      recordTurn(finished);
    }

    if (finished && !finished.blocked) {
      addMessage(answerMessage);
      keepReply(finished);
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
  // 422 = the request itself is wrong (e.g. the plan expired): trying again won't help
  const mustRestart = error?.status === 422;
  // while a reply streams, its meta already says which question it asks.
  // Only kept when the turn gets through (keepReply)
  const shownProgress = (turn?.streaming && turn.progress) || progress;

  return (
    <div className="flex flex-col gap-4">
      {plan && shownProgress && !ended && (
        <p className="text-sm text-muted-foreground">
          Question {shownProgress.question + 1} of {plan.plan.questions.length}
        </p>
      )}
      <Transcript messages={messages}>
        {pending && <TranscriptLine role="user" content={pending} />}
        {(turn?.streaming || turn?.blocked) && (
          <TranscriptLine role="assistant" content={turn.reply || "…"} />
        )}
      </Transcript>
      {ended ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground">{ENDED_TEXT[ended]}</p>
          <Link href="/results" className={buttonVariants()}>
            See your feedback
          </Link>
        </div>
      ) : noQuestion || mustRestart ? (
        <div className="flex items-center justify-end gap-2">
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Back to setup
          </Link>
          {!mustRestart && <Button onClick={firstTurn}>Try again</Button>}
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
