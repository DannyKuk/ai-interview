"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Preset } from "@/lib/api";
import { useInterviewStore } from "@/lib/store";

const NO_CV = "no-cv";

type ChoiceCardProps = {
  value: string;
  initial: string;
  title: string;
  description: string;
};

function ChoiceCard({ value, initial, title, description }: ChoiceCardProps) {
  const id = `candidate-${value}`;
  return (
    <FieldLabel htmlFor={id}>
      <Field orientation="horizontal">
        <Avatar>
          <AvatarFallback className="font-heading">{initial}</AvatarFallback>
        </Avatar>
        <FieldContent className="min-w-0">
          <FieldTitle>{title}</FieldTitle>
          <FieldDescription className="truncate">{description}</FieldDescription>
        </FieldContent>
        <RadioGroupItem value={value} id={id} />
      </Field>
    </FieldLabel>
  );
}

// the ready-made candidates + "no CV". Picking one fills company, role, interviewer,
// profile and job description
export function PresetPicker({ presets }: { presets: Preset[] }) {
  const presetId = useInterviewStore((state) => state.presetId);
  const profile = useInterviewStore((state) => state.profile);
  const choosePreset = useInterviewStore((state) => state.choosePreset);
  const clearCandidate = useInterviewStore((state) => state.clearCandidate);
  const picked = presets.find((preset) => preset.id === presetId);
  // an uploaded CV is none of these cards: "" matches no radio
  const value = presetId ?? (profile ? "" : NO_CV);

  function handleChange(next: unknown) {
    const preset = presets.find((preset) => preset.id === next);
    if (preset) {
      choosePreset(preset);
    } else if (next === NO_CV) {
      clearCandidate();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <RadioGroup value={value} onValueChange={handleChange} className="grid-cols-1 sm:grid-cols-2">
        {presets.map((preset) => (
          <ChoiceCard
            key={preset.id}
            value={preset.id}
            initial={preset.profile.first_name?.[0] ?? "?"}
            title={preset.profile.first_name ?? preset.settings.role}
            description={`${preset.settings.role}, ${preset.settings.company}`}
          />
        ))}
        <ChoiceCard
          value={NO_CV}
          initial="–"
          title="No CV"
          description="Questions from the company and role only"
        />
      </RadioGroup>
      {picked && (
        <p className="text-sm text-muted-foreground">
          {picked.profile.headline}.{" "}
          <a href={picked.cv_file} download className="underline underline-offset-4">
            Download the CV (PDF)
          </a>
        </p>
      )}
    </div>
  );
}
