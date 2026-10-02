"use client";

import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { BarRow } from "@/lib/benchmarks";

import { LABEL_SPACE, OTHER, USED } from "./chart-style";
import { nameTick } from "./name-tick";

const ROW_HEIGHT = 36;

type Props = { rows: BarRow[]; max: number; valueName: string };

export function BarRows({ rows, max, valueName }: Props) {
  const config = { value: { label: valueName } } satisfies ChartConfig;
  // Recharts colours each bar by its row's `fill`
  const data = rows.map((row) => ({ ...row, fill: row.used ? USED : OTHER }));

  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height: rows.length * ROW_HEIGHT }}
    >
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: LABEL_SPACE }}>
        <XAxis type="number" dataKey="value" domain={[0, max]} hide />
        <YAxis
          type="category"
          dataKey="name"
          width="auto"
          tickLine={false}
          axisLine={false}
          tick={nameTick(rows)}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent className="min-w-48" />} />
        <Bar dataKey="value" radius={4} isAnimationActive={false}>
          <LabelList
            dataKey="label"
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
