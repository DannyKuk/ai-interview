"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Transcript } from "@/components/interview/transcript";
import { Scorecard } from "@/components/results/scorecard";
import { Button, buttonVariants } from "@/components/ui/button";
import { useFeedback } from "@/hooks/use-feedback";
import { answersFrom } from "@/lib/answers";
import { useInterviewStore, useStoreHydrated } from "@/lib/store";

// fewer answers than this → no score, "ended early"
const MIN_ANSWERS = 2;

export function ResultsView() {
  const hydrated = useStoreHydrated();
  const messages = useInterviewStore((state) => state.messages);
  const ended = useInterviewStore((state) => state.ended);
  const plan = useInterviewStore((state) => state.plan);
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
    <div className="flex flex-col gap-6">
      {!scored ? (
        <p>Interview ended early. Answer at least {MIN_ANSWERS} questions to get a score.</p>
      ) : feedback ? (
        <Scorecard feedback={feedback} />
      ) : error ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-destructive">{error.message}</p>
          {error.final ? (
            <Link href="/" className={buttonVariants()}>
              Start a new interview
            </Link>
          ) : (
            <Button onClick={retry}>Try again</Button>
          )}
        </div>
      ) : (
        loading && (
          <p className="text-muted-foreground">
            Scoring your answers and writing your feedback. This takes about 20 seconds…
          </p>
        )
      )}
      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-medium">Transcript</h2>
        <Transcript messages={messages} />
      </section>
    </div>
  );
}
