import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FeedbackResponse } from "@/lib/api";

type Evaluation = FeedbackResponse["evaluations"][number];
type Criterion = Evaluation["criteria"][number];

// scores are 1-5 with two decimals from the backend, one is enough to read
function formatScore(score: number): string {
  return score.toFixed(1);
}

// the whole feedback: overall score, strengths / improvements, one card per answered
// question, the sample answer. No "use client": it's rendered by ResultsView, which is one
export function Scorecard({ feedback }: { feedback: FeedbackResponse }) {
  const { scorecard, evaluations } = feedback;
  const weakest = evaluations.find(
    (evaluation) => evaluation.question === scorecard.weakest_question,
  );

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex items-baseline gap-3">
          <span className="text-4xl font-semibold">{formatScore(scorecard.overall)}</span>
          <span className="text-muted-foreground">
            out of 5 · {scorecard.answered} of {scorecard.total} questions answered
          </span>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Points title="What went well" points={scorecard.strengths} />
        <Points title="What to work on" points={scorecard.improvements} />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Per question</h2>
        {evaluations.map((evaluation) => (
          <QuestionCard
            key={evaluation.question}
            evaluation={evaluation}
            weakest={evaluation === weakest}
          />
        ))}
      </section>

      {weakest && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">
            A stronger answer to question {weakest.question + 1}
          </h2>
          <p className="text-sm text-muted-foreground">
            {weakest.asked} Use it as a template: replace the [brackets] with your own story.
          </p>
          <Card>
            <CardContent>
              <SampleAnswer text={scorecard.sample_answer} />
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}

function Points({ title, points }: { title: string; points: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function QuestionCard({ evaluation, weakest }: { evaluation: Evaluation; weakest: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Question {evaluation.question + 1} · {evaluation.topic}
          {weakest && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">(weakest)</span>
          )}
        </CardTitle>
        <CardAction className="text-lg font-semibold">{formatScore(evaluation.score)}</CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{evaluation.asked}</p>
        <p>{evaluation.feedback}</p>
        <ul className="flex flex-col gap-2">
          {evaluation.criteria.map((criterion) => (
            <CriterionLine key={criterion.criterion} criterion={criterion} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// a criterion with its score as a bar: 1 = empty, 5 = full
function CriterionLine({ criterion }: { criterion: Criterion }) {
  const filled = ((criterion.score - 1) / 4) * 100;

  return (
    <li className="flex flex-col gap-1 text-sm">
      <div className="flex justify-between gap-4">
        <span>{criterion.criterion}</span>
        <span className="font-medium">{formatScore(criterion.score)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${filled}%` }} />
      </div>
    </li>
  );
}

// the [placeholders] the candidate fills in stand out
function SampleAnswer({ text }: { text: string }) {
  // split with a capture group keeps the matches: "a [b] c" → ["a ", "[b]", " c"]
  const parts = text.split(/(\[[^\]]+\])/);

  return (
    <p>
      {parts.map((part, index) =>
        part.startsWith("[") ? (
          <mark key={index} className="rounded bg-muted px-1 text-foreground">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </p>
  );
}
