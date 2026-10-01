"use client";

import { ClockIcon, ListIcon, UserRoundIcon } from "lucide-react";
import { useState } from "react";

import { Card, CardContent, CardFooter, CardTitle } from "@/components/ui/card";
import type { InterviewSettings } from "@/lib/api";

// a rough guess for the invite: one question with its answer and maybe a follow-up
const MINUTES_PER_QUESTION = 3;

type InviteCardProps = {
  settings: InterviewSettings;
  interviewer: string;
  children: React.ReactNode;
};

export function InviteCard({ settings, interviewer, children }: InviteCardProps) {
  const [today] = useState(() => new Date());
  const { role, company, persona, difficulty, question_count } = settings;

  return (
    <Card className="ring-primary/35">
      <CardContent className="grid grid-cols-[auto_minmax(0,1fr)] gap-4">
        {/* our own: shadcn has no date tile */}
        <div className="w-16 self-start overflow-hidden rounded-lg bg-muted text-center">
          <span className="block bg-primary py-0.5 text-xs font-semibold text-primary-foreground">
            {today.toLocaleDateString("en", { weekday: "short" })}
          </span>
          <span className="block font-heading text-3xl leading-tight font-semibold">
            {today.getDate()}
          </span>
          <span className="block pb-1 text-xs text-muted-foreground">
            {today.toLocaleDateString("en", { month: "short" })}
          </span>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5 text-sm text-muted-foreground">
          <CardTitle className="text-lg text-foreground">{role || "Your"} interview</CardTitle>
          <p className="flex items-center gap-2">
            <UserRoundIcon className="size-4 shrink-0" />
            <span>
              with <span className="font-medium text-foreground">{interviewer}</span>, {company}
            </span>
          </p>
          <p className="flex items-center gap-2">
            <ClockIcon className="size-4 shrink-0" />
            <span>
              <span className="font-medium text-foreground">Now</span>, about{" "}
              {question_count * MINUTES_PER_QUESTION} minutes
            </span>
          </p>
          <p className="flex items-center gap-2">
            <ListIcon className="size-4 shrink-0" />
            <span className="first-letter:uppercase">
              {persona} interviewer, {difficulty}, {question_count} questions
            </span>
          </p>
        </div>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3">{children}</CardFooter>
    </Card>
  );
}
