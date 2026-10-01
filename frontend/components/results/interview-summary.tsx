"use client";

import { Fragment, type ReactNode } from "react";

import { totalCost, usd } from "@/components/dev-panel/session-numbers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useInterviewStore } from "@/lib/store";

type Row = { label: string; value: ReactNode };

export function InterviewSummary() {
  const settings = useInterviewStore((state) => state.settings);
  const dev = useInterviewStore((state) => state.dev);
  const cloudVoice = useInterviewStore((state) => state.cloudVoice);
  const muted = useInterviewStore((state) => state.muted);
  const turnLog = useInterviewStore((state) => state.turnLog);
  const costs = useInterviewStore((state) => state.costs);

  if (!settings || !dev) {
    return null;
  }

  const { model, reasoning_effort, max_tokens } = dev.modelSettings;
  const checked = turnLog.filter((entry) => entry.guard?.category).length;
  const blocked = turnLog.filter((entry) => entry.blocked).length;
  const offTopic = turnLog.filter((entry) => entry.guard?.category === "off_topic").length;
  const { total, unreported } = totalCost(costs, turnLog);

  const settingRows: Row[] = [
    { label: "Model", value: `${model}, ${reasoning_effort}` },
    { label: "Max tokens", value: max_tokens },
    { label: "Prompt", value: dev.technique.replaceAll("_", " ") },
    { label: "Interviewer", value: `${settings.persona}, ${settings.difficulty}` },
    {
      label: "Voice",
      value: muted ? "off" : cloudVoice ? "Gemini, cloud" : "HeadTTS, local",
    },
    { label: "Speech to text", value: "Parakeet, local" },
  ];
  const guardRows: Row[] = [
    {
      label: "Answers checked",
      value: `${checked}, ${blocked === 0 ? "none" : blocked} blocked`,
    },
    { label: "Off topic, steered back", value: offTopic },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>This interview</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SummarySection title="Settings" rows={settingRows} />
        <SummarySection title="Guard" rows={guardRows} />
        <SummarySection
          title="Cost"
          rows={[
            {
              label: "Total",
              value: unreported ? `${usd(total)} + not reported ones` : usd(total),
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function SummarySection({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {rows.map((row) => (
          <Fragment key={row.label}>
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="text-right tabular-nums">{row.value}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}
