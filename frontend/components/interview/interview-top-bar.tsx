"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type InterviewTopBarProps = {
  company?: string;
  role?: string;
  questionCount?: number;
  currentQuestion?: number; // 0-based; none = no question asked yet
  ended: boolean;
  startedAt: number | null;
  endedAt: number | null;
};

export function InterviewTopBar({
  company,
  role,
  questionCount,
  currentQuestion,
  ended,
  startedAt,
  endedAt,
}: InterviewTopBarProps) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 pr-12 pl-2 sm:pr-28">
      <span className="font-semibold">{company}</span>
      <h1 className="text-muted-foreground">{role} interview</h1>
      {!!questionCount && (
        <QuestionProgress count={questionCount} current={currentQuestion} ended={ended} />
      )}
      {startedAt && (
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          <ElapsedTime startedAt={startedAt} endedAt={endedAt} />
        </span>
      )}
    </header>
  );
}

type QuestionProgressProps = { count: number; current?: number; ended: boolean };

function QuestionProgress({ count, current, ended }: QuestionProgressProps) {
  const done = ended ? count : (current ?? 0);

  return (
    <span className="flex items-center gap-1">
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-1 w-4.5 rounded-full bg-muted",
            index < done && "bg-muted-foreground/50",
            !ended && index === current && "bg-primary",
          )}
        />
      ))}
      <span className="ml-1.5 text-sm text-muted-foreground">
        {ended ? "Interview ended" : current !== undefined && `Question ${current + 1} of ${count}`}
      </span>
    </span>
  );
}

function ElapsedTime({ startedAt, endedAt }: { startedAt: number; endedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endedAt) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [endedAt]);

  const seconds = Math.max(0, Math.floor(((endedAt ?? now) - startedAt) / 1000));
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
