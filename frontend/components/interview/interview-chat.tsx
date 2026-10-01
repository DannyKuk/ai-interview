"use client";

import type { TalkingHead } from "@met4citizen/talkinghead";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AnswerInput } from "@/components/interview/answer-input";
import { CallBar } from "@/components/interview/call-bar";
import { InterviewStage } from "@/components/interview/interview-stage";
import { InterviewTopBar } from "@/components/interview/interview-top-bar";
import { Transcript, TranscriptLine } from "@/components/interview/transcript";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useChatStream, type StreamedTurn } from "@/hooks/use-chat-stream";
import { useSpeech } from "@/hooks/use-speech";
import type { ChatMessage, ChatRequest } from "@/lib/api";
import { listenTo, stopThinking, THINKING } from "@/lib/avatar-gestures";
import { useInterviewStore, useStoreHydrated, type EndReason } from "@/lib/store";

// request for the next interviewer turn: the whole transcript goes along every time,
// the plan unchanged (it's signed) and where we are in it
function buildRequest(messages: ChatMessage[]): ChatRequest {
  const { sessionId, settings, dev, plan, progress } = useInterviewStore.getState();
  return {
    session_id: sessionId!,
    // without our question tags: the backend rejects unknown fields
    messages: messages.map(({ role, content }) => ({ role, content })),
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
  const muted = useInterviewStore((state) => state.muted);
  const setMuted = useInterviewStore((state) => state.setMuted);
  const avatar = useInterviewStore((state) => state.avatar);
  const setAvatar = useInterviewStore((state) => state.setAvatar);
  const company = useInterviewStore((state) => state.settings?.company);
  const persona = useInterviewStore((state) => state.settings?.persona);
  const role = useInterviewStore((state) => state.settings?.role);
  const interviewer = useInterviewStore((state) => state.interviewer);
  const candidate = useInterviewStore((state) => state.profile?.first_name ?? null);
  const startedAt = useInterviewStore((state) => state.startedAt);
  const endedAt = useInterviewStore((state) => state.endedAt);
  const [head, setHead] = useState<TalkingHead | null>(null);
  const [micAnalyser, setMicAnalyser] = useState<AnalyserNode | null>(null);
  const speech = useSpeech(head);
  const { turn, error, send, stop } = useChatStream({ onEvent: speech.handleEvent });
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  // a reply that got through: into the transcript (tagged with the question it asks,
  // except the goodbye), and the plan moves on
  const keepReply = useCallback(
    (finished: StreamedTurn) => {
      const question = finished.ended ? undefined : finished.progress?.question;
      addMessage({ role: "assistant", content: finished.reply, question });
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

  // she waves hello when she first appears
  useEffect(() => {
    const answered = useInterviewStore.getState().messages.some(({ role }) => role === "user");
    if (head && !answered) {
      head.playGesture("handup", 2);
    }
  }, [head]);

  const thinking =
    messages.length > 0 &&
    !speech.replyStarted &&
    (!!turn?.streaming || speech.speaking) &&
    !(muted && turn?.reply);
  useEffect(() => {
    if (!head || !thinking) {
      return;
    }

    head.playGesture(THINKING, 30);

    return () => stopThinking(head);
  }, [head, thinking]);

  useEffect(() => {
    if (!head || !micAnalyser) {
      return;
    }

    listenTo(head, micAnalyser);
    return () => head.stopListening();
  }, [head, micAnalyser]);

  // a new error (429, backend down, ...) pops up as a toast. The answer is back in the box
  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  async function answer(text: string) {
    const answerMessage: ChatMessage = { role: "user", content: text };
    speech.stop(); // answering while it still talks: it stops
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
    speech.stop();
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
    <>
      <InterviewTopBar
        company={company}
        role={role}
        questionCount={plan?.plan.questions.length}
        currentQuestion={shownProgress?.question}
        ended={!!ended}
        startedAt={startedAt}
        endedAt={endedAt}
      />
      <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_340px]">
        <InterviewStage
          company={company}
          persona={persona}
          avatar={avatar}
          onReady={setHead}
          interviewer={interviewer}
          speaking={speech.speaking}
          candidate={candidate}
          mic={micAnalyser}
        />
        <Card className="min-h-0">
          <CardHeader>
            <CardTitle>Transcript</CardTitle>
          </CardHeader>
          {/* column-reverse keeps the scroll pinned to the newest line without any JS */}
          <CardContent className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto">
            <Transcript messages={messages}>
              {pending && <TranscriptLine role="user" content={pending} />}
              {(turn?.streaming || turn?.blocked) && (
                <TranscriptLine role="assistant" content={turn.reply || "…"} />
              )}
            </Transcript>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3">
            {ended ? (
              <>
                <p className="text-muted-foreground">{ENDED_TEXT[ended]}</p>
                <Link href="/results" className={buttonVariants()}>
                  See your feedback
                </Link>
              </>
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
                onMicStart={speech.stop}
                onMicAudio={setMicAnalyser}
              />
            )}
          </CardFooter>
        </Card>
      </div>
      <CallBar
        muted={muted}
        onMutedChange={setMuted}
        stillImage={!avatar}
        onStillImageChange={(stillImage) => setAvatar(!stillImage)}
        ended={!!ended}
        onEnd={leave}
      />
    </>
  );
}
