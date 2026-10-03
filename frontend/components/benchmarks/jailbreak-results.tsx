import { cn } from "cn";
import { ArrowRightIcon } from "lucide-react";
import { Fragment } from "react";

import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { GuardRow, JailbreakStep } from "@/lib/benchmarks";

type Props = { steps: JailbreakStep[]; guards: GuardRow[] };

export function JailbreakResults({ steps, guards }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="grid items-center gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
          {steps.map((step, index) => (
            <Fragment key={step.title}>
              {index > 0 && (
                <ArrowRightIcon className="mx-auto size-4 rotate-90 text-muted-foreground md:rotate-0" />
              )}
              <Card
                size="sm"
                className={cn("h-full bg-transparent", step.used && "ring-primary/40")}
              >
                <CardContent className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">{step.title}</p>
                  <p className={cn("text-2xl font-semibold", step.used && "text-primary")}>
                    {step.value}
                  </p>
                  <p className="text-sm text-muted-foreground">{step.label}</p>
                </CardContent>
              </Card>
            </Fragment>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          In every round no normal answer was blocked by mistake. A full round costs about $0.04.
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Way in</TableHead>
            <TableHead>What guards it</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {guards.map((row) => (
            <TableRow key={row.way}>
              <TableCell className="align-top whitespace-normal">{row.way}</TableCell>
              <TableCell className="whitespace-normal">{row.guard}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
