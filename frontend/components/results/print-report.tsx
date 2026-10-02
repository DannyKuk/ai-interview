"use client";

import { Transcript } from "@/components/interview/transcript";
import {
  QuestionDetails,
  QuestionHeading,
  SampleAnswer,
  ScoreSummary,
  weakestOf,
} from "@/components/results/scorecard";
import type { FeedbackResponse } from "@/lib/api";
import { useInterviewStore } from "@/lib/store";
import { formatDuration } from "@/lib/time";

// the results as a document: only shown when printing, with every question open
export function PrintReport({ feedback }: { feedback: FeedbackResponse }) {
  const messages = useInterviewStore((state) => state.messages);
  const company = useInterviewStore((state) => state.settings?.company);
  const role = useInterviewStore((state) => state.settings?.role);
  const startedAt = useInterviewStore((state) => state.startedAt);
  const endedAt = useInterviewStore((state) => state.endedAt);
  const weakest = weakestOf(feedback);

  return (
    <article className="hidden flex-col gap-8 print:flex">
      <header className="flex items-end justify-between gap-4 border-b pb-4">
        <div className="flex flex-col gap-1">
          <span className="font-heading text-3xl font-semibold">{company}</span>
          <h1 className="text-muted-foreground">{role} interview</h1>
        </div>
        {startedAt && (
          <span className="text-right text-sm text-muted-foreground">
            {new Date(startedAt).toLocaleDateString("en-GB", { dateStyle: "long" })}
            {endedAt && `, ${formatDuration((endedAt - startedAt) / 1000)}`}
          </span>
        )}
      </header>

      <ScoreSummary feedback={feedback} />

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold">Your answers</h2>
        {feedback.evaluations.map((evaluation) => (
          <div
            key={evaluation.question}
            className="flex break-inside-avoid flex-col gap-3 border-t pt-4"
          >
            <div className="flex items-center gap-3">
              <QuestionHeading evaluation={evaluation} weakest={evaluation === weakest} />
            </div>
            <div className="pl-10">
              <QuestionDetails evaluation={evaluation} />
            </div>
          </div>
        ))}
      </section>

      {weakest && (
        <section className="flex break-inside-avoid flex-col gap-2">
          <h2 className="font-heading text-xl font-semibold">
            A stronger answer to question {weakest.question + 1}
          </h2>
          <p className="text-muted-foreground">
            {weakest.asked} Use it as a template: fill in the [brackets] and change any detail that
            isn&apos;t yours.
          </p>
          <SampleAnswer text={feedback.scorecard.sample_answer} />
        </section>
      )}

      <section className="flex break-before-page flex-col gap-4 [&_li]:break-inside-avoid">
        <h2 className="font-heading text-xl font-semibold">Transcript</h2>
        <Transcript messages={messages} />
      </section>
    </article>
  );
}
