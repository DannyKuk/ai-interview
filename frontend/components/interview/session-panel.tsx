"use client";

import { useEffect, useState } from "react";

import { SessionNumbers } from "@/components/dev-panel/session-numbers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getConfig } from "@/lib/api";

export function SessionPanel() {
  const [costCap, setCostCap] = useState<number | null>(null);

  useEffect(() => {
    async function loadCostCap() {
      try {
        setCostCap((await getConfig()).session_cost_cap_usd);
      } catch {
        // without the limit the bar just doesn't show; the numbers still do
      }
    }
    loadCostCap();
  }, []);

  return (
    <Card className="max-h-96 min-h-0 lg:max-h-full">
      <CardHeader>
        <CardTitle>Session</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-col gap-4 overflow-y-auto text-sm *:first:border-t-0 *:first:pt-0">
        <SessionNumbers costCap={costCap} />
      </CardContent>
    </Card>
  );
}
