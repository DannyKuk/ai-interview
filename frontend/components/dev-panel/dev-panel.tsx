"use client";

import { SettingsIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useState } from "react";

import { OptionSelect } from "@/components/option-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  ApiError,
  getConfig,
  type AppConfig,
  type GuardVerdict,
  type ModelSettings,
} from "@/lib/api";
import { useInterviewStore, useStoreHydrated, type TurnLogEntry } from "@/lib/store";

type Effort = ModelSettings["reasoning_effort"];

// gear icon (or ?dev=1) → side sheet. Separate from the candidate UI, lives in the root layout.
// useSearchParams needs a <Suspense> around it (see layout.tsx)
export function DevPanel() {
  const [open, setOpen] = useState(useSearchParams().get("dev") === "1");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  // runs once after the first render (like onMounted): load the model list
  useEffect(() => {
    async function loadConfig() {
      try {
        setConfig(await getConfig());
      } catch (error) {
        setError(error instanceof ApiError ? error.message : "Could not reach the server.");
      }
    }
    loadConfig();
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="fixed top-3 right-3"
            aria-label="Developer settings"
          />
        }
      >
        <SettingsIcon />
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Developer settings</SheetTitle>
          <SheetDescription>Used from the next interviewer turn on.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4 pb-4">
          {error ? <p>{error}</p> : config ? <DevSettingsForm config={config} /> : <p>Loading…</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DevSettingsForm({ config }: { config: AppConfig }) {
  const hydrated = useStoreHydrated();
  const dev = useInterviewStore((state) => state.dev);
  const updateDev = useInterviewStore((state) => state.updateDev);

  if (!hydrated) {
    return <p>Loading…</p>;
  }
  if (!dev) {
    // the setup page fills in the defaults
    return <p>Open the setup page first.</p>;
  }

  const { modelSettings } = dev;
  const modelId = modelSettings.model ?? config.default_model;
  const model = config.models.find((m) => m.id === modelId);
  const supports = (param: string) => model?.supported_parameters?.includes(param) ?? true;
  const efforts = (model?.reasoning_efforts ?? [modelSettings.reasoning_effort]) as Effort[];

  function updateModel(patch: Partial<ModelSettings>) {
    updateDev({ modelSettings: { ...modelSettings, ...patch } });
  }

  return (
    <>
      <OptionSelect
        id="technique"
        label="Prompt technique"
        options={config.techniques}
        value={dev.technique}
        onChange={(technique) => updateDev({ technique })}
      />
      <OptionSelect
        id="model"
        label="Model"
        options={config.models.map((m) => m.id)}
        value={modelId}
        onChange={(model) => updateModel({ model })}
        hint={
          model?.input_price_per_m != null
            ? `$${model.input_price_per_m} in / $${model.output_price_per_m} out per 1M tokens`
            : undefined
        }
      />
      <OptionSelect
        id="effort"
        label="Reasoning effort"
        options={efforts}
        value={modelSettings.reasoning_effort}
        onChange={(reasoning_effort) => updateModel({ reasoning_effort })}
        disabled={!supports("reasoning")}
        hint={supports("reasoning") ? "Lower = faster replies" : `Not supported by ${modelId}`}
      />
      <MaxTokensInput
        value={modelSettings.max_tokens}
        range={config.max_tokens_range}
        onChange={(max_tokens) => updateModel({ max_tokens })}
        disabled={!supports("max_tokens")}
      />
      <SessionInfo />
      <CostBreakdown />
      <GuardLog />
    </>
  );
}

const usd = (value: number) => `$${value.toFixed(4)}`;

// plan progress + the last turn's tokens and ending (cost and guard have their own sections)
function SessionInfo() {
  const lastTurn = useInterviewStore((state) => state.turnLog.at(-1));
  const plan = useInterviewStore((state) => state.plan);
  const progress = useInterviewStore((state) => state.progress);

  return (
    <section className="flex flex-col gap-2 border-t pt-4">
      <h3 className="font-medium">This interview</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">Plan</dt>
        <dd>{plan ? plan.plan.approach : "none"}</dd>
        {plan && progress && (
          <>
            <dt className="text-muted-foreground">Progress</dt>
            <dd>
              question {progress.question + 1} of {plan.plan.questions.length}
              {progress.extra_turns > 0 && `, ${progress.extra_turns} extra turn(s)`}
            </dd>
          </>
        )}
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

// undefined = that call didn't happen, null = no cost reported
type CostRow = { label: string; cost: number | null | undefined; noCall: string };

function CostBreakdown() {
  const costs = useInterviewStore((state) => state.costs);
  const turnLog = useInterviewStore((state) => state.turnLog);

  const rows: CostRow[] = [
    { label: "CV", cost: costs.cv, noCall: "no upload" },
    { label: "Plan", cost: costs.plan, noCall: "not made yet" },
    // no usage = no model call: blocked, or over the cost cap
    ...turnLog.map((entry, index) => ({
      label: `Turn ${index + 1}`,
      cost: entry.usage ? entry.usage.cost : undefined,
      noCall: "no model call",
    })),
    { label: "Feedback", cost: costs.feedback, noCall: "not yet" },
  ];
  const known = rows.map((row) => row.cost).filter((cost) => typeof cost === "number");
  const total = known.reduce((sum, cost) => sum + cost, 0);
  const unreported = rows.some((row) => row.cost === null);

  return (
    <section className="flex flex-col gap-2 border-t pt-4">
      <h3 className="font-medium">Cost</h3>
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
            </dd>
          </Fragment>
        ))}
        <dt className="font-medium">Total</dt>
        <dd className="font-medium">
          {usd(total)}
          {unreported && " + not reported ones"}
        </dd>
      </dl>
      <p className="text-xs text-muted-foreground">
        LLM calls only, Jev&apos;s checks aren&apos;t in it
      </p>
    </section>
  );
}

const prob = (value: number | null | undefined) => (value == null ? "–" : value.toFixed(2));

// the two most likely categories, e.g. "ok 0.98 · off_topic 0.02"
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
  entry: { guard, blocked, hint },
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
    </li>
  );
}

type MaxTokensInputProps = {
  value: number;
  range: [number, number];
  onChange: (value: number) => void;
  disabled: boolean;
};

// the typed text lives here - only a valid number goes into the store (else the backend says 422)
function MaxTokensInput({ value, range: [min, max], onChange, disabled }: MaxTokensInputProps) {
  const [draft, setDraft] = useState(String(value));
  const isValid = (num: number) => Number.isInteger(num) && num >= min && num <= max;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="max-tokens">Max tokens</Label>
      <Input
        id="max-tokens"
        type="number"
        min={min}
        max={max}
        step={100}
        value={draft}
        disabled={disabled}
        aria-invalid={!isValid(Number(draft))}
        onChange={(event) => {
          setDraft(event.target.value);
          const next = Number(event.target.value);
          if (isValid(next)) onChange(next);
        }}
        // leaving the field with an invalid number shows the last valid one again
        onBlur={() => setDraft(String(value))}
      />
      <p className="text-xs text-muted-foreground">
        {min}–{max}. Includes the reasoning tokens: too low gives empty replies
      </p>
    </div>
  );
}
