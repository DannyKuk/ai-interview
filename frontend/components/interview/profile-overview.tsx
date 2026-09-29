"use client";

import { OptionSelect } from "@/components/option-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CandidateProfile } from "@/lib/api";
import { useInterviewStore } from "@/lib/store";

type Seniority = CandidateProfile["seniority"];
const SENIORITIES: Seniority[] = ["junior", "mid", "senior", "lead"];
// same as min_length on interview_topics in the backend: fewer → /plan says 422
const MIN_TOPICS = 3;

// FR-3 "Is this right?": what the interviewer will know. The bits the LLM gets wrong most
// (headline, seniority, years, skills, topics) can be fixed; the rest is shown as read.
// defaultOpen: open after an upload, closed for a preset (ours, already checked)
export function ProfileOverview({ defaultOpen }: { defaultOpen: boolean }) {
  const profile = useInterviewStore((state) => state.profile);
  const updateProfile = useInterviewStore((state) => state.updateProfile);

  if (!profile) {
    return null;
  }

  return (
    // a native <details>: open / close without any state of our own
    <details open={defaultOpen} className="rounded-lg border p-4 text-sm">
      <summary className="cursor-pointer font-medium">
        What the interviewer knows about {profile.first_name ?? "you"}. Is this right?
      </summary>

      <div className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="headline">Headline</Label>
          <Input
            id="headline"
            value={profile.headline}
            onChange={(event) => updateProfile({ headline: event.target.value })}
          />
        </div>
        <div className="flex gap-4">
          <OptionSelect
            id="seniority"
            label="Level (in your field)"
            options={SENIORITIES}
            value={profile.seniority}
            onChange={(seniority) => updateProfile({ seniority })}
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor="years">Years of experience</Label>
            <Input
              id="years"
              type="number"
              min={0}
              max={60}
              className="w-24"
              value={profile.years_experience ?? ""}
              // "" = unknown, like the backend's null; whole years (the backend wants an int)
              onChange={(event) =>
                updateProfile({
                  years_experience:
                    event.target.value === "" ? null : Math.round(Number(event.target.value)),
                })
              }
            />
          </div>
        </div>

        <Chips
          label="Skills"
          items={profile.skills}
          canRemove
          onRemove={(skill) => updateProfile({ skills: profile.skills.filter((s) => s !== skill) })}
        />
        <Chips
          label="What they may ask about"
          items={profile.interview_topics}
          canRemove={profile.interview_topics.length > MIN_TOPICS}
          onRemove={(topic) =>
            updateProfile({
              interview_topics: profile.interview_topics.filter((t) => t !== topic),
            })
          }
        />

        <section className="flex flex-col gap-2">
          <h3 className="font-medium">Experience</h3>
          <ul className="flex flex-col gap-3">
            {profile.experience.map((job) => (
              <li key={`${job.title}-${job.company}-${job.period}`}>
                <p>
                  <span className="font-medium">{job.title}</span>, {job.company}{" "}
                  <span className="text-muted-foreground">({job.period})</span>
                </p>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {job.highlights.map((highlight) => (
                    <li key={highlight}>{highlight}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>

        {profile.education.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="font-medium">Education</h3>
            <ul className="list-disc pl-5">
              {profile.education.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </details>
  );
}

type ChipsProps = {
  label: string;
  items: string[];
  canRemove: boolean;
  onRemove: (item: string) => void;
};

// a list you can only shrink: removing a wrong skill is easy, inventing new ones isn't the point
function Chips({ label, items, canRemove, onRemove }: ChipsProps) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-medium">{label}</h3>
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-1 rounded-full bg-muted px-3 py-1">
            {item}
            {canRemove && (
              <button
                type="button"
                aria-label={`Remove ${item}`}
                onClick={() => onRemove(item)}
                className="text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
