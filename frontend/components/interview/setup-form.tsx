"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PresetPicker } from "@/components/interview/preset-picker";
import { OptionSelect } from "@/components/option-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createPlan,
  errorMessage,
  getConfig,
  getPresets,
  MAX_JD_CHARS,
  type AppConfig,
  type Preset,
} from "@/lib/api";
import { useInterviewStore, useStoreHydrated } from "@/lib/store";

export function SetupForm() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const hydrated = useStoreHydrated();
  const settings = useInterviewStore((state) => state.settings);
  const updateSettings = useInterviewStore((state) => state.updateSettings);
  const jobDescription = useInterviewStore((state) => state.jobDescription);
  const setJobDescription = useInterviewStore((state) => state.setJobDescription);
  const dev = useInterviewStore((state) => state.dev);
  const updateDev = useInterviewStore((state) => state.updateDev);
  const startInterview = useInterviewStore((state) => state.startInterview);
  const router = useRouter();

  // runs once after the first render (like onMounted)
  useEffect(() => {
    async function loadConfig() {
      try {
        const [config, presets] = await Promise.all([getConfig(), getPresets()]);
        setConfig(config);
        setPresets(presets);
      } catch (error) {
        setError(errorMessage(error, "Could not reach the server."));
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

  if (!hydrated || !config || !presets || !settings || !dev) {
    return <p>Loading…</p>;
  }

  const [minQuestions, maxQuestions] = config.question_count_range;
  const questionCounts = Array.from({ length: maxQuestions - minQuestions + 1 }, (_, i) =>
    String(minQuestions + i),
  );

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault(); // no page reload
    setStarting(true);
    setStartError(null);
    try {
      const { settings, profile, jobDescription } = useInterviewStore.getState();
      const plan = await createPlan({
        settings: settings!,
        profile,
        job_description: jobDescription || null,
      });
      startInterview(plan);
      router.push("/interview"); // stays "starting" until the page changes
    } catch (error) {
      setStartError(errorMessage(error));
      setStarting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <fieldset disabled={starting} className="flex flex-col gap-4">
        <PresetPicker presets={presets} />
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
        <div className="flex flex-col gap-2">
          <Label htmlFor="job_description">Job description (optional)</Label>
          <Textarea
            id="job_description"
            rows={8}
            maxLength={MAX_JD_CHARS}
            placeholder="Paste the job ad: the questions will fit what it asks for."
            value={jobDescription}
            onChange={(event) => setJobDescription(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {jobDescription.length} / {MAX_JD_CHARS} characters
          </p>
        </div>
        <OptionSelect
          id="difficulty"
          label="Difficulty"
          options={config.difficulties}
          value={settings.difficulty}
          onChange={(difficulty) => updateSettings({ difficulty })}
        />
        <OptionSelect
          id="question_count"
          label="Questions"
          options={questionCounts}
          value={String(settings.question_count)}
          onChange={(count) => updateSettings({ question_count: Number(count) })}
        />
        <OptionSelect
          id="persona"
          label="Interviewer"
          options={config.personas}
          value={settings.persona}
          onChange={(persona) => updateSettings({ persona })}
        />
        <Button type="submit" size="lg" className="self-start">
          {starting ? "Preparing your interview…" : "Start interview"}
        </Button>
        {startError && <p className="text-sm text-destructive">{startError}</p>}
      </fieldset>
    </form>
  );
}
