"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { CvUpload } from "@/components/interview/cv-upload";
import { PresetPicker } from "@/components/interview/preset-picker";
import { ProfileOverview } from "@/components/interview/profile-overview";
import { OptionSelect } from "@/components/option-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  const [uploading, setUploading] = useState(false);
  const cloudVoice = useInterviewStore((state) => state.cloudVoice);
  const setCloudVoice = useInterviewStore((state) => state.setCloudVoice);
  const [startError, setStartError] = useState<string | null>(null);
  const hydrated = useStoreHydrated();
  const settings = useInterviewStore((state) => state.settings);
  const updateSettings = useInterviewStore((state) => state.updateSettings);
  const jobDescription = useInterviewStore((state) => state.jobDescription);
  const presetId = useInterviewStore((state) => state.presetId);
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
      const { value: plan, cost } = await createPlan({
        settings: settings!,
        profile,
        job_description: jobDescription || null,
      });
      startInterview(plan, cost);
      router.push("/interview"); // stays "starting" until the page changes
    } catch (error) {
      setStartError(errorMessage(error));
      setStarting(false);
    }
  }

  return (
    // one <form> around both columns: Start submits it, and the fieldset locks everything while busy
    <form onSubmit={handleSubmit}>
      <fieldset
        disabled={starting || uploading}
        className="grid min-w-0 items-start gap-4 md:grid-cols-2"
      >
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>You</CardTitle>
              <CardDescription>Pick a candidate or use your own CV</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <PresetPicker presets={presets} />
              <CvUpload locked={starting || uploading} onUploadingChange={setUploading} />
            </CardContent>
          </Card>
          <ProfileOverview defaultOpen={!presetId} />
        </div>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>The interview</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
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
            <div className="flex flex-wrap items-center gap-4">
              <Button type="submit" size="lg">
                {starting ? "Preparing your interview…" : "Start interview"}
              </Button>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={cloudVoice} onCheckedChange={setCloudVoice} />
                Cloud voice
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              {cloudVoice
                ? "Google's Gemini voice: sounds more natural, about $0.03 per interview, and a few seconds more before each reply. Only the interviewer's text goes to Google, never your voice."
                : "A free voice that runs on this computer. Turn on the cloud voice for a more natural one."}
            </p>
            {startError && <p className="text-sm text-destructive">{startError}</p>}
          </CardContent>
        </Card>
      </fieldset>
    </form>
  );
}
