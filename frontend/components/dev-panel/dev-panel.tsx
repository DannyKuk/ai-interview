"use client";

import { SettingsIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

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
import { ApiError, getConfig, type AppConfig, type ModelSettings } from "@/lib/api";
import { useInterviewStore, useStoreHydrated } from "@/lib/store";

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
    </>
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
