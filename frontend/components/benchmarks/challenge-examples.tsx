import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { ChallengeExample } from "@/lib/benchmarks";

const badgeProps = {
  push: { variant: "outline", className: "border-primary/40 text-primary" },
  note: { variant: "warning", className: "" },
  none: { variant: "outline", className: "text-muted-foreground" },
} as const;

export function ChallengeExamples({ examples }: { examples: ChallengeExample[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {examples.map((example) => {
        const pushes = example.value >= example.threshold;
        const badge = badgeProps[example.tone];
        return (
          <li
            key={example.quote}
            className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[1fr_14rem_13rem] md:items-center md:gap-6"
          >
            <div>
              <q className="text-foreground">{example.quote}</q>
              <p className="mt-1 text-xs text-muted-foreground">{example.kind}</p>
            </div>
            {/* the shadcn Progress draws its own track last, so the threshold line sits on it via bottom-0 */}
            <Progress
              value={example.value * 100}
              aria-label={`${example.signal}: ${example.value.toFixed(2)}`}
              className={cn(
                "relative gap-1 [&_[data-slot=progress-track]]:h-2.5",
                !pushes && "[&_[data-slot=progress-indicator]]:bg-chart-muted",
              )}
            >
              <span className="text-xs text-muted-foreground">{example.signal}</span>
              <span className="ml-auto text-xs tabular-nums">{example.value.toFixed(2)}</span>
              <span
                aria-hidden
                className="absolute -bottom-1 h-[18px] w-0.5 rounded-full bg-foreground/70"
                style={{ left: `${example.threshold * 100}%` }}
              />
            </Progress>
            <Badge
              variant={badge.variant}
              className={cn("h-6 justify-self-start px-2.5 text-[13px]", badge.className)}
            >
              {example.outcome}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}
