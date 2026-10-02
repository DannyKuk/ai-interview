import { CircleHelpIcon } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { FeedbackResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

type Evaluation = FeedbackResponse["evaluations"][number];
type Criterion = Evaluation["criteria"][number];

// from this many answers with claims Jev couldn't check, the summary says so
const SEVERAL_UNVERIFIED = 2;

// scores are 1-5 with two decimals from the backend, one is enough to read
function formatScore(score: number): string {
  return score.toFixed(1);
}

// 1 = empty, 5 = full
function percentOf(score: number): number {
  return ((score - 1) / 4) * 100;
}

function weakestOf({ scorecard, evaluations }: FeedbackResponse): Evaluation | undefined {
  return evaluations.find((evaluation) => evaluation.question === scorecard.weakest_question);
}

// the left column
export function ScoreSummary({
  feedback: { scorecard, evaluations },
}: {
  feedback: FeedbackResponse;
}) {
  const unverified = evaluations.filter((evaluation) => evaluation.unverified).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <strong className="font-heading text-7xl leading-none font-semibold tracking-tight tabular-nums">
          {formatScore(scorecard.overall)}
        </strong>
        <span className="text-muted-foreground">
          out of 5, {scorecard.answered} of {scorecard.total} questions answered
        </span>
        <Progress
          value={percentOf(scorecard.overall)}
          className="mt-3 *:data-[slot=progress-track]:h-2"
        />
        <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
          {[1, 2, 3, 4, 5].map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
      </div>
      {unverified >= SEVERAL_UNVERIFIED && (
        <Alert>
          <CircleHelpIcon />
          <AlertTitle>{unverified} answers we couldn&apos;t check</AlertTitle>
          <AlertDescription>
            They contain technical claims too new or niche for us to verify, so they didn&apos;t
            lower your score. A real interviewer may ask how you know: be ready to back them up.
          </AlertDescription>
        </Alert>
      )}
      <Points
        title="What went well"
        points={scorecard.strengths}
        empty="Nothing to build on yet. Start with the points under “What to work on”."
      />
      <Points title="What to work on" points={scorecard.improvements} hollow />
    </div>
  );
}

export function ScoreSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-18 w-28" />
        <Skeleton className="h-4 w-52" />
        <Skeleton className="h-2 w-full" />
      </div>
      {[0, 1].map((section) => (
        <div key={section} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ))}
    </div>
  );
}

type PointsProps = { title: string; points: string[]; empty?: string; hollow?: boolean };

function Points({ title, points, empty, hollow }: PointsProps) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-medium">{title}</h3>
      {points.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {points.map((point) => (
            <li key={point} className="grid grid-cols-[14px_1fr] gap-2">
              <span
                className={cn(
                  "mt-1.5 size-2 rounded-full",
                  hollow ? "border-[1.5px] border-muted-foreground" : "bg-primary",
                )}
              />
              {point}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// the right column: one row per answered question (the weakest open), then the sample answer
export function QuestionResults({ feedback }: { feedback: FeedbackResponse }) {
  const weakest = weakestOf(feedback);

  return (
    <>
      <Card className="py-2">
        <CardContent>
          <Accordion multiple defaultValue={weakest ? [weakest.question] : []}>
            {feedback.evaluations.map((evaluation) => (
              <QuestionRow
                key={evaluation.question}
                evaluation={evaluation}
                weakest={evaluation === weakest}
              />
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {weakest && (
        <Card>
          <CardHeader>
            <CardTitle>A stronger answer to question {weakest.question + 1}</CardTitle>
            <CardDescription>
              {weakest.asked} Use it as a template: replace the [brackets] with your own story.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SampleAnswer text={feedback.scorecard.sample_answer} />
          </CardContent>
        </Card>
      )}
    </>
  );
}

function QuestionRow({ evaluation, weakest }: { evaluation: Evaluation; weakest: boolean }) {
  return (
    <AccordionItem value={evaluation.question}>
      <AccordionTrigger className="min-w-0 items-center gap-3 py-3 hover:no-underline">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold tabular-nums">
          {evaluation.question + 1}
        </span>
        {/* phones: the badges get their own line, else the topic shrinks to "Fr…" */}
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate max-sm:basis-full">{evaluation.topic}</span>
          {weakest && <Badge variant="warning">Weakest</Badge>}
          {evaluation.wrong_claim && <Badge variant="destructive">Wrong claim</Badge>}
          {evaluation.unverified && <Badge variant="outline">Couldn&apos;t verify</Badge>}
        </span>
        <Progress value={percentOf(evaluation.score)} className="hidden w-16 shrink-0 sm:flex" />
        <span className="w-8 shrink-0 text-right font-heading text-lg font-semibold tabular-nums">
          {formatScore(evaluation.score)}
        </span>
      </AccordionTrigger>
      <AccordionContent className="flex flex-col gap-3 pl-10 [&_p:not(:last-child)]:mb-0">
        <p className="text-muted-foreground">{evaluation.asked}</p>
        <p>{evaluation.feedback}</p>
        {evaluation.unverified && (
          <p className="text-muted-foreground">
            Some technical claims here are too new or niche for us to check, so correctness
            isn&apos;t part of this score. In a real interview, be ready to explain how you know.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {evaluation.criteria.map((criterion) => (
            <CriterionLine key={criterion.criterion} criterion={criterion} />
          ))}
        </ul>
      </AccordionContent>
    </AccordionItem>
  );
}

function CriterionLine({ criterion }: { criterion: Criterion }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_120px_3ch] items-center gap-3 tabular-nums">
      <span>{criterion.criterion}</span>
      <Progress value={percentOf(criterion.score)} />
      <span className="text-right text-muted-foreground">{formatScore(criterion.score)}</span>
    </li>
  );
}

// the [placeholders] the candidate fills in stand out
function SampleAnswer({ text }: { text: string }) {
  // split with a capture group keeps the matches: "a [b] c" → ["a ", "[b]", " c"]
  const parts = text.split(/(\[[^\]]+\])/);

  return (
    <p className="leading-relaxed">
      {parts.map((part, index) =>
        part.startsWith("[") ? (
          <mark key={index} className="rounded bg-primary/15 px-1 text-primary">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </p>
  );
}
