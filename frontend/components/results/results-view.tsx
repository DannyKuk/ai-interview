"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Transcript } from "@/components/interview/transcript";
import { answersFrom } from "@/lib/answers";
import { useInterviewStore, useStoreHydrated } from "@/lib/store";

// fewer answers than this → no score, "ended early"
const MIN_ANSWERS = 2;

export function ResultsView() {
  const hydrated = useStoreHydrated();
  const messages = useInterviewStore((state) => state.messages);
  const ended = useInterviewStore((state) => state.ended);
  const router = useRouter();

  // nothing to show without an interview
  useEffect(() => {
    if (hydrated && !useInterviewStore.getState().sessionId) {
      router.replace("/");
    }
  }, [hydrated, router]);

  if (!hydrated) {
    return <p>Loading…</p>;
  }

  // answered plan questions, not messages: a follow-up or "I'd like to stop" isn't one
  const answers = answersFrom(messages, ended).length;

  return (
    <div className="flex flex-col gap-6">
      {answers < MIN_ANSWERS ? (
        <p>Interview ended early. Answer at least {MIN_ANSWERS} questions to get a score.</p>
      ) : (
        <p className="text-muted-foreground">Your scored feedback will show up here soon.</p>
      )}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Transcript</h2>
        <Transcript messages={messages} />
      </section>
    </div>
  );
}
