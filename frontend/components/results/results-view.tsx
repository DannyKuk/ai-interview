"use client";

import { ChevronDownIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Transcript } from "@/components/interview/transcript";
import { InterviewSummary } from "@/components/results/interview-summary";
import { QuestionResults, ScoreSkeleton, ScoreSummary } from "@/components/results/scorecard";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { useFeedback, type FeedbackError } from "@/hooks/use-feedback";
import { answersFrom } from "@/lib/answers";
import type { ChatMessage } from "@/lib/api";
import { useInterviewStore, useStoreHydrated } from "@/lib/store";
import { formatDuration } from "@/lib/time";
import { cn } from "@/lib/utils";

// fewer answers than this → no score, "ended early"
const MIN_ANSWERS = 2;

export function ResultsView() {
  const hydrated = useStoreHydrated();
  const messages = useInterviewStore((state) => state.messages);
  const ended = useInterviewStore((state) => state.ended);
  const plan = useInterviewStore((state) => state.plan);
  const company = useInterviewStore((state) => state.settings?.company);
  const role = useInterviewStore((state) => state.settings?.role);
  const startedAt = useInterviewStore((state) => state.startedAt);
  const endedAt = useInterviewStore((state) => state.endedAt);
  const router = useRouter();

  const answers = answersFrom(messages, ended).length;
  const scored = answers >= MIN_ANSWERS;
  const { feedback, loading, error, retry } = useFeedback(hydrated && scored && !!ended && !!plan);

  // nothing to show without an interview
  useEffect(() => {
    if (hydrated && !useInterviewStore.getState().sessionId) {
      router.replace("/");
    }
  }, [hydrated, router]);

  if (!hydrated) {
    return <p>Loading…</p>;
  }

  return (
    <>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 pr-12 pl-2 sm:pr-28">
        <span className="font-semibold">{company}</span>
        <h1 className="order-last basis-full text-muted-foreground sm:order-none sm:basis-auto">
          {role} interview
          {startedAt && endedAt && ` ended after ${formatDuration((endedAt - startedAt) / 1000)}`}
        </h1>
        <Link href="/" className={buttonVariants({ size: "lg", className: "ml-auto" })}>
          <PlusIcon data-icon="inline-start" />
          New interview
        </Link>
      </header>

      <div className="grid items-start gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          {(!scored || feedback || loading) && (
            <Card>
              <CardContent>
                {!scored ? (
                  <p>
                    Interview ended early. Answer at least {MIN_ANSWERS} questions to get a score.
                  </p>
                ) : feedback ? (
                  <ScoreSummary feedback={feedback} />
                ) : (
                  <ScoreSkeleton />
                )}
              </CardContent>
            </Card>
          )}
          <InterviewSummary />
        </div>

        {/* phones stack the columns: while scoring, the wait comes first, not the skeleton */}
        <div
          className={cn("flex min-w-0 flex-col gap-3", scored && !feedback && "max-lg:order-first")}
        >
          {feedback ? (
            <QuestionResults feedback={feedback} />
          ) : (
            scored &&
            (loading || error) && <FeedbackStatus error={error} retry={retry} answers={answers} />
          )}
          <TranscriptCard messages={messages} />
        </div>
      </div>
    </>
  );
}

type FeedbackStatusProps = { error: FeedbackError | null; retry: () => void; answers: number };

function FeedbackStatus({ error, retry, answers }: FeedbackStatusProps) {
  return (
    <Card>
      <Empty className="py-12">
        {error ? (
          <>
            <EmptyHeader>
              <EmptyTitle className="text-xl">Couldn&apos;t score your answers</EmptyTitle>
              <EmptyDescription>{error.message}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              {error.final ? (
                <Link href="/" className={buttonVariants()}>
                  Start a new interview
                </Link>
              ) : (
                <Button onClick={retry}>Try again</Button>
              )}
            </EmptyContent>
          </>
        ) : (
          <EmptyHeader>
            <EmptyMedia variant="icon" className="size-12 rounded-full bg-primary/10 text-primary">
              <Spinner className="size-6" />
            </EmptyMedia>
            <EmptyTitle className="text-xl">Scoring your answers</EmptyTitle>
            <EmptyDescription>
              Going through your {answers} answers and writing your feedback. This takes about 20
              seconds.
            </EmptyDescription>
          </EmptyHeader>
        )}
      </Empty>
    </Card>
  );
}

function TranscriptCard({ messages }: { messages: ChatMessage[] }) {
  return (
    <Card>
      <Collapsible>
        <CardHeader>
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-4 text-left">
            <CardTitle>Transcript</CardTitle>
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              {messages.length} messages
              <ChevronDownIcon className="size-4 transition-transform group-data-panel-open:rotate-180" />
            </span>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-4">
            <Transcript messages={messages} />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
