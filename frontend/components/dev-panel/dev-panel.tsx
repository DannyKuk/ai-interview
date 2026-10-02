"use client";

import { SlidersHorizontalIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { SessionNumbers } from "@/components/dev-panel/session-numbers";
import { OptionSelect } from "@/components/option-select";
import { OptionToggle } from "@/components/option-toggle";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  errorMessage,
  getConfig,
  getSystemPrompt,
  type AppConfig,
  type ModelInfo,
  type ModelSettings,
  type SystemPromptRequest,
} from "@/lib/api";
import { useInterviewStore, useStoreHydrated } from "@/lib/store";

type Effort = ModelSettings["reasoning_effort"];
// the backend lists a model's efforts high → minimal; the toggle reads better from low to high
const EFFORT_ORDER: Effort[] = ["minimal", "low", "medium", "high"];

// Settings button top right on every page (or ?dev=1) → side sheet over the content.
// Lives in the root layout.
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
            variant="outline"
            size="sm"
            className="absolute top-3.5 right-4 z-10"
            aria-label="Settings"
          />
        }
      >
        <SlidersHorizontalIcon />
        <span className="hidden sm:inline">Settings</span>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
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
  const efforts = EFFORT_ORDER.filter((effort) =>
    (model?.reasoning_efforts ?? [modelSettings.reasoning_effort]).includes(effort),
  );

  function updateModel(patch: Partial<ModelSettings>) {
    updateDev({ modelSettings: { ...modelSettings, ...patch } });
  }

  return (
    <>
      <ModelPicker
        models={config.models}
        value={modelId}
        onChange={(model) => updateModel({ model })}
      />
      <OptionToggle
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
      <OptionSelect
        id="technique"
        label="Prompt technique"
        options={config.techniques}
        value={dev.technique}
        onChange={(technique) => updateDev({ technique })}
      />
      <PromptView />
      <SessionNumbers costCap={config.session_cost_cap_usd} />
    </>
  );
}

const price = (value: number | null | undefined) => (value == null ? "?" : `$${value.toFixed(2)}`);

type ModelPickerProps = {
  models: ModelInfo[];
  value: string;
  onChange: (model: string) => void;
};

function ModelPicker({ models, value, onChange }: ModelPickerProps) {
  return (
    <FieldSet className="gap-0">
      <FieldLegend variant="label">Model</FieldLegend>
      <RadioGroup
        value={value}
        onValueChange={(next) => {
          const picked = models.find((m) => m.id === next);
          if (picked) {
            onChange(picked.id);
          }
        }}
      >
        {models.map((m) => (
          <FieldLabel key={m.id} htmlFor={`model-${m.id}`}>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>{m.id.split("/").at(-1)}</FieldTitle>
                <FieldDescription className="tabular-nums">
                  {price(m.input_price_per_m)} in / {price(m.output_price_per_m)} out per 1M tokens
                </FieldDescription>
              </FieldContent>
              <RadioGroupItem value={m.id} id={`model-${m.id}`} />
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
    </FieldSet>
  );
}

// the system prompt the next turn gets. Loaded on click, not on every change:
// each load counts toward the chat's rate limit
function PromptView() {
  const settings = useInterviewStore((state) => state.settings);
  const technique = useInterviewStore((state) => state.dev?.technique);
  const plan = useInterviewStore((state) => state.plan);
  const [shown, setShown] = useState<{ key: string; prompt: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!settings || !technique) {
    return null;
  }

  const body: SystemPromptRequest = { settings, system_prompt: technique, plan };
  // everything the prompt is made from: when it changes, the shown prompt is out of date
  const key = JSON.stringify(body);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { prompt } = await getSystemPrompt(body);
      setShown({ key, prompt });
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-2 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">System prompt</h3>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? "Loading…" : shown ? "Reload" : "Show"}
        </Button>
      </div>
      {error && <p className="text-destructive">{error}</p>}
      {shown && shown.key !== key && (
        <p className="text-muted-foreground">The settings changed: reload to see the new prompt.</p>
      )}
      {shown && (
        <pre className="max-h-96 overflow-auto text-xs whitespace-pre-wrap">{shown.prompt}</pre>
      )}
      <p className="text-xs text-muted-foreground">
        {plan ? "With this interview's plan" : "Without a plan"}, the canary masked. Each turn also
        gets a note of its own (what to ask now), not shown here.
      </p>
    </section>
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
        {min}–{max}. Includes the reasoning tokens: too low gives empty or cut-off replies
      </p>
    </div>
  );
}
