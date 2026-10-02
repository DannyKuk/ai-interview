"use client";

import { cn } from "cn";
import { Bar, BarChart, LabelList, Text, XAxis, YAxis, type YAxisTickContentProps } from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { BarRow } from "@/lib/benchmarks";

import { LABEL_SPACE, OTHER, USED } from "./chart-style";

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
          tick={({ x, y, textAnchor, index, payload }: YAxisTickContentProps) => (
            <Text
              x={x}
              y={y}
              textAnchor={textAnchor}
              verticalAnchor="middle"
              fontSize={13}
              // width="auto" measures only the names that carry this class
              className={cn(
                "recharts-cartesian-axis-tick-value",
                rows[index]?.used && "fill-primary! font-semibold",
              )}
            >
              {String(payload.value)}
            </Text>
          )}
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
