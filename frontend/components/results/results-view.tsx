"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Transcript } from "@/components/interview/transcript";
import { useInterviewStore, useStoreHydrated } from "@/lib/store";

// fewer answers than this → no score, "ended early"
const MIN_ANSWERS = 2;

export function ResultsView() {
  const hydrated = useStoreHydrated();
  const messages = useInterviewStore((state) => state.messages);
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

  const answers = messages.filter((message) => message.role === "user").length;

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
