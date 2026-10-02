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
import type { PairedRow } from "@/lib/benchmarks";

import { LABEL_SPACE } from "./chart-style";
import { nameTick } from "./name-tick";

export type Series = { label: string; color: string; outline?: boolean };

const ROW_HEIGHT = 52;
const LEGEND_HEIGHT = 32;

type Props = { rows: PairedRow[]; max: number; a: Series; b: Series };

// an outlined bar has no fill, so the legend and tooltip need an outlined square of their own
function OutlineSwatch() {
  return <span className="size-2.5 shrink-0 rounded-[2px] border-[1.5px] border-chart-muted" />;
}

function seriesConfig({ label, color, outline }: Series) {
  return { label, color, icon: outline ? OutlineSwatch : undefined };
}

export function PairedBars({ rows, max, a, b }: Props) {
  const config = { a: seriesConfig(a), b: seriesConfig(b) } satisfies ChartConfig;

  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height: rows.length * ROW_HEIGHT + LEGEND_HEIGHT }}
    >
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ left: 0, right: LABEL_SPACE }}
        barSize={16}
        barGap={3}
      >
        <XAxis type="number" domain={[0, max]} hide />
        <YAxis
          type="category"
          dataKey="name"
          width="auto"
          tickLine={false}
          axisLine={false}
          tick={nameTick(rows)}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent className="min-w-48" />} />
        <ChartLegend
          itemSorter={null}
          content={<ChartLegendContent className="flex-wrap justify-start gap-x-4 gap-y-1" />}
        />
        {(["a", "b"] as const).map((key) => {
          const series = key === "a" ? a : b;
          return (
            <Bar
              key={key}
              dataKey={key}
              radius={4}
              isAnimationActive={false}
              fill={series.outline ? "transparent" : `var(--color-${key})`}
              stroke={series.outline ? `var(--color-${key})` : undefined}
              strokeWidth={1.5}
            >
              <LabelList
                dataKey={`${key}Label`}
                position="right"
                offset={8}
                className="fill-foreground"
                fontSize={13}
              />
            </Bar>
          );
        })}
      </BarChart>
    </ChartContainer>
  );
}
