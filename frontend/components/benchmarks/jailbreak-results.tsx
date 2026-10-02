import { cn } from "cn";

import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { GuardRow, Tile } from "@/lib/benchmarks";

export function JailbreakResults({ stats, guards }: { stats: Tile[]; guards: GuardRow[] }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card
            key={stat.label}
            size="sm"
            className={cn("bg-transparent", stat.used && "ring-primary/40")}
          >
            <CardContent className="flex flex-col gap-1">
              <p className={cn("text-2xl font-semibold", stat.used && "text-primary")}>
                {stat.value}
              </p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
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
