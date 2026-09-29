"use client";

import type { Preset } from "@/lib/api";
import { useInterviewStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const CARD =
  "flex flex-col gap-1 rounded-lg border p-3 text-left text-sm transition-colors hover:bg-muted";
const SELECTED = "border-primary ring-2 ring-primary";

// the ready-made candidates + "no CV". Picking one fills company, role, interviewer,
// profile and job description
export function PresetPicker({ presets }: { presets: Preset[] }) {
  const presetId = useInterviewStore((state) => state.presetId);
  const profile = useInterviewStore((state) => state.profile);
  const choosePreset = useInterviewStore((state) => state.choosePreset);
  const clearCandidate = useInterviewStore((state) => state.clearCandidate);
  const picked = presets.find((preset) => preset.id === presetId);

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-medium">Candidate</legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={preset.id === presetId}
            onClick={() => choosePreset(preset)}
            className={cn(CARD, preset.id === presetId && SELECTED)}
          >
            <span className="font-semibold">{preset.settings.company}</span>
            <span>{preset.settings.role}</span>
            <span className="text-muted-foreground">
              {preset.profile.first_name} · {preset.profile.seniority}
            </span>
          </button>
        ))}
        <button
          type="button"
          aria-pressed={!profile}
          onClick={clearCandidate}
          className={cn(CARD, !profile && SELECTED)}
        >
          <span className="font-semibold">No CV</span>
          <span className="text-muted-foreground">Questions from the company and role only</span>
        </button>
      </div>
      {picked && (
        <p className="text-sm text-muted-foreground">
          {picked.profile.headline}.{" "}
          <a href={picked.cv_file} download className="underline underline-offset-4">
            Download the CV (PDF)
          </a>
        </p>
      )}
    </fieldset>
  );
}
