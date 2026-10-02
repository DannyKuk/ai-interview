import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BeforeAfterMeasure } from "@/lib/benchmarks";

import { OTHER, USED } from "./chart-style";
import { PairedBars } from "./paired-bars";

const BEFORE = { label: "Before the fixes", color: OTHER, outline: true };
const AFTER = { label: "After the fixes", color: USED };

export function BeforeAfterBars({ measures }: { measures: BeforeAfterMeasure[] }) {
  return (
    <Tabs defaultValue={measures[0].name} className="gap-4">
      <TabsList className="max-w-full flex-wrap group-data-horizontal/tabs:h-auto">
        {measures.map((measure) => (
          <TabsTrigger key={measure.name} value={measure.name} className="px-2.5">
            {measure.name}
          </TabsTrigger>
        ))}
      </TabsList>
      {measures.map((measure) => (
        <TabsContent key={measure.name} value={measure.name} className="flex flex-col gap-2">
          <PairedBars rows={measure.rows} max={1} a={BEFORE} b={AFTER} />
          <p className="text-xs text-muted-foreground">{measure.hint}</p>
        </TabsContent>
      ))}
    </Tabs>
  );
}
