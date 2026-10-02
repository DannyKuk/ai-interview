"use client";

import { Fragment } from "react";

import { Progress } from "@/components/ui/progress";
import type { GuardVerdict } from "@/lib/api";
import { useInterviewStore, type Costs, type TurnLogEntry } from "@/lib/store";

export function SessionNumbers({ costCap }: { costCap: number | null }) {
  return (
    <>
      <CostBreakdown costCap={costCap} />
      <SessionInfo />
      <GuardLog />
    </>
  );
}

export const usd = (value: number) => `$${value.toFixed(4)}`;

const sum = (costs: (number | null | undefined)[]) =>
  costs.filter((cost) => typeof cost === "number").reduce((total, cost) => total + cost, 0);

function jevCosts(costs: Costs, turnLog: TurnLogEntry[]) {
  return [
    costs.cv?.guardCost,
    costs.plan?.guardCost,
    ...turnLog.map((entry) => entry.guard?.cost),
    costs.feedback?.guardCost,
  ].filter((cost) => typeof cost === "number");
}

// everything this interview cost so far
export function totalCost(costs: Costs, turnLog: TurnLogEntry[]) {
  const llm = [
    costs.cv?.cost,
    costs.plan?.cost,
    ...turnLog.map((entry) => entry.usage?.cost),
    costs.voice,
    costs.feedback?.cost,
  ];
  return {
    total: sum([...llm, ...jevCosts(costs, turnLog)]),
    unreported: llm.some((cost) => cost === null),
  };
}

function SessionInfo() {
  const lastTurn = useInterviewStore((state) => state.turnLog.at(-1));
  const plan = useInterviewStore((state) => state.plan);

  return (
    <section className="flex flex-col gap-2 border-t pt-4">
      <h3 className="font-medium">This interview</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">Plan</dt>
        <dd>{plan ? plan.plan.approach : "none"}</dd>
        {lastTurn ? (
          <>
            <dt className="text-muted-foreground">Last turn</dt>
            <dd>
              {lastTurn.usage
                ? `${lastTurn.usage.input_tokens} in / ${lastTurn.usage.output_tokens} out tokens`
                : "no model call"}
            </dd>
            <dt className="text-muted-foreground">Ended</dt>
            <dd>{lastTurn.ended ?? "no"}</dd>
          </>
        ) : (
          <>
            <dt className="text-muted-foreground">Last turn</dt>
            <dd>none yet</dd>
          </>
        )}
      </dl>
    </section>
  );
}

type CostRow = { label: string; cost: number | null | undefined; noCall: string; detail?: string };

function CostBreakdown({ costCap }: { costCap: number | null }) {
  const costs = useInterviewStore((state) => state.costs);
  const turnLog = useInterviewStore((state) => state.turnLog);

  const turnCosts = turnLog.map((entry) => entry.usage?.cost).filter((cost) => cost !== undefined);
  const jev = jevCosts(costs, turnLog);
  const rows: CostRow[] = [
    { label: "CV", cost: costs.cv?.cost, noCall: "no upload" },
    { label: "Plan", cost: costs.plan?.cost, noCall: "not made yet" },
    {
      label: "Interviewer",
      cost: turnCosts.length > 0 ? sum(turnCosts) : undefined,
      noCall: "no turns yet",
      detail: turnLog.length === 1 ? "1 turn" : `${turnLog.length} turns`,
    },
    { label: "Jev checks", cost: jev.length > 0 ? sum(jev) : undefined, noCall: "none yet" },
    // Gemini's sentences added up; HeadTTS is local and free
    { label: "Voice", cost: costs.voice, noCall: "local voice (free)" },
    { label: "Feedback", cost: costs.feedback?.cost, noCall: "not yet" },
  ];

  const { total, unreported } = totalCost(costs, turnLog);
  // what the backend's cap counts: everything after the plan
  const counted = sum([
    ...turnCosts,
    ...turnLog.map((entry) => entry.guard?.cost),
    costs.voice,
    costs.feedback?.cost,
    costs.feedback?.guardCost,
  ]);

  return (
    <section className="flex flex-col gap-2 border-t pt-4">
      <h3 className="font-medium">Cost</h3>
      <p className="font-heading text-2xl font-semibold tabular-nums">
        {usd(total)}
        {unreported && <span className="text-sm font-normal"> + not reported ones</span>}
      </p>
      {costCap !== null && (
        <>
          <Progress value={Math.min(100, (counted / costCap) * 100)} />
          <p className="text-xs text-muted-foreground">
            {usd(counted)} of the ${costCap.toFixed(2)} interview limit (CV and plan don&apos;t
            count)
          </p>
        </>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {rows.map((row) => (
          <Fragment key={row.label}>
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd>
              {row.cost === undefined
                ? row.noCall
                : row.cost === null
                  ? "not reported"
                  : usd(row.cost)}
              {row.detail && row.cost !== undefined && ` · ${row.detail}`}
            </dd>
          </Fragment>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        LLM calls, Jev&apos;s checks and the cloud voice (its cost estimated by the backend)
      </p>
    </section>
  );
}

const prob = (value: number | null | undefined) => (value == null ? "–" : value.toFixed(2));

function topProbabilities(probabilities: GuardVerdict["probabilities"]): string {
  return Object.entries(probabilities ?? {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .map(([category, p]) => `${category} ${prob(p)}`)
    .join(" · ");
}

function guardLabel(guard: GuardVerdict | null, blocked: TurnLogEntry["blocked"]): string {
  if (!guard) return "no Jev call (cost cap)";
  if (guard.category) return guard.category;
  return blocked === "guard_error" ? "no answer from Jev" : "opening";
}

function GuardLog() {
  const turnLog = useInterviewStore((state) => state.turnLog);

  return (
    <section className="flex flex-col gap-2 border-t pt-4">
      <h3 className="font-medium">Guard log</h3>
      {turnLog.length === 0 ? (
        <p className="text-muted-foreground">No turns yet</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {turnLog
            .map((entry, index) => <GuardLogRow key={index} turn={index + 1} entry={entry} />)
            .reverse()}
        </ol>
      )}
    </section>
  );
}

function GuardLogRow({
  turn,
  entry: { guard, blocked, hint, usage },
}: {
  turn: number;
  entry: TurnLogEntry;
}) {
  return (
    <li className="flex flex-col gap-0.5">
      <p>
        <span className="font-medium">Turn {turn}</span>
        {" · "}
        {guardLabel(guard, blocked)}
        {typeof usage?.cost === "number" && ` · ${usd(usage.cost)}`}
        {blocked ? (
          <span className="text-destructive"> · blocked ({blocked})</span>
        ) : (
          hint && ` · hint: ${hint}`
        )}
      </p>
      {guard?.category && (
        <p className="text-muted-foreground">{topProbabilities(guard.probabilities)}</p>
      )}
      {guard?.role_injection != null && (
        <p className="text-muted-foreground">role injection {prob(guard.role_injection)}</p>
      )}
      {guard?.category && (
        <p className="text-muted-foreground">
          answered {prob(guard.answered)} · vague {prob(guard.vague)} · wants to end{" "}
          {prob(guard.wants_to_end)}
        </p>
      )}
      {guard?.category && (
        <p className="text-muted-foreground">
          wrong claim {prob(guard.wrong_claim)} · unverified {prob(guard.unverified_claim)} ·
          contradiction {prob(guard.contradiction)}
        </p>
      )}
    </li>
  );
}
