import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FeedbackCell, LocalFeedbackRow } from "@/lib/benchmarks";

const COLUMNS = [
  { key: "details", label: "Made-up details" },
  { key: "percentages", label: "Made-up %" },
  { key: "strengths", label: "Strengths named" },
  { key: "failed", label: "No report" },
  { key: "seconds", label: "Time" },
] as const;

function Value({ cell }: { cell: FeedbackCell }) {
  if (!cell.flag) {
    return cell.text;
  }
  return <Badge variant={cell.flag === "wrong" ? "destructive" : "warning"}>{cell.text}</Badge>;
}

export function FeedbackTable({ rows }: { rows: LocalFeedbackRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Model</TableHead>
          {COLUMNS.map((column) => (
            <TableHead key={column.key}>{column.label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.name}>
            <TableCell className={cn(row.used && "font-medium text-primary")}>{row.name}</TableCell>
            {COLUMNS.map((column) => (
              <TableCell key={column.key}>
                <Value cell={row[column.key]} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
