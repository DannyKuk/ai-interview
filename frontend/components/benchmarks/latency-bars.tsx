"use client";

import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { LatencyRow } from "@/lib/benchmarks";

import { LABEL_SPACE } from "./chart-style";
import { nameTick } from "./name-tick";

const config = {
  stt: { label: "Your words → text", color: "var(--color-chart-1)" },
  reply: { label: "Safety check + first sentence written", color: "var(--color-chart-2)" },
  speech: { label: "First sentence spoken", color: "var(--color-chart-3)" },
} satisfies ChartConfig;

export function LatencyBars({ rows }: { rows: LatencyRow[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-36 w-full">
      <BarChart data={rows} layout="vertical" margin={{ left: 0, right: LABEL_SPACE }} barSize={28}>
        <XAxis type="number" domain={[0, 6]} hide />
        <YAxis
          type="category"
          dataKey="name"
          width="auto"
          tickLine={false}
          axisLine={false}
          tick={nameTick(rows)}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent className="min-w-80" />} />
        <ChartLegend
          itemSorter={null}
          content={<ChartLegendContent className="flex-wrap justify-start gap-x-4 gap-y-1" />}
        />
        <Bar
          dataKey="stt"
          stackId="wait"
          fill="var(--color-stt)"
          radius={[4, 0, 0, 4]}
          isAnimationActive={false}
        />
        <Bar dataKey="reply" stackId="wait" fill="var(--color-reply)" isAnimationActive={false} />
        <Bar
          dataKey="speech"
          stackId="wait"
          fill="var(--color-speech)"
          radius={[0, 4, 4, 0]}
          isAnimationActive={false}
        >
          <LabelList
            dataKey="range"
            position="right"
            offset={8}
            className="fill-foreground"
            fontSize={13}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
