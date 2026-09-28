"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, getConfig, type AppConfig } from "@/lib/api";
import { useInterviewStore, useStoreHydrated } from "@/lib/store";

export function SetupForm() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useStoreHydrated();
  const settings = useInterviewStore((state) => state.settings);
  const updateSettings = useInterviewStore((state) => state.updateSettings);
  const dev = useInterviewStore((state) => state.dev);
  const updateDev = useInterviewStore((state) => state.updateDev);
  const startInterview = useInterviewStore((state) => state.startInterview);
  const router = useRouter();

  // runs once after the first render (like onMounted)
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

  // keep what the candidate picked earlier in this tab, else start from the backend defaults
  useEffect(() => {
    if (hydrated && config && !settings) {
      updateSettings(config.default_settings);
    }
    if (hydrated && config && !dev) {
      updateDev({
        technique: config.default_technique,
        modelSettings: config.default_model_settings,
      });
    }
  }, [hydrated, config, settings, updateSettings, dev, updateDev]);

  if (error) {
    return <p>{error}</p>;
  }

  if (!hydrated || !config || !settings || !dev) {
    return <p>Loading…</p>;
  }

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault(); // no page reload
    startInterview(); // new session_id for this interview
    router.push("/interview");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <OptionSelect
        id="company"
        label="Company"
        options={config.companies}
        value={settings.company}
        onChange={(company) => updateSettings({ company })}
      />
      <div className="flex flex-col gap-2">
        <Label htmlFor="role">Role</Label>
        <Input
          id="role"
          value={settings.role}
          onChange={(event) => updateSettings({ role: event.target.value })}
        />
      </div>
      <OptionSelect
        id="difficulty"
        label="Difficulty"
        options={config.difficulties}
        value={settings.difficulty}
        onChange={(difficulty) => updateSettings({ difficulty })}
      />
      <OptionSelect
        id="persona"
        label="Interviewer"
        options={config.personas}
        value={settings.persona}
        onChange={(persona) => updateSettings({ persona })}
      />
      <Button type="submit" size="lg" className="self-start">
        Start interview
      </Button>
    </form>
  );
}

type OptionSelectProps<T extends string> = {
  id: string;
  label: string;
  options: T[];
  value: T;
  onChange: (value: T) => void;
};

function OptionSelect<T extends string>({
  id,
  label,
  options,
  value,
  onChange,
}: OptionSelectProps<T>) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(next) => next && onChange(next)}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
