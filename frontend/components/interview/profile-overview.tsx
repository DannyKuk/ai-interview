"use client";

import { ChevronDownIcon, XIcon } from "lucide-react";

import { OptionSelect } from "@/components/option-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CandidateProfile } from "@/lib/api";
import { useInterviewStore } from "@/lib/store";

type Seniority = CandidateProfile["seniority"];
const SENIORITIES: Seniority[] = ["junior", "mid", "senior", "lead"];
// same as min_length on interview_topics in the backend: fewer → /plan says 422
const MIN_TOPICS = 3;

// "Is this right?": what the interviewer will know. The bits the LLM gets wrong most
// (headline, seniority, years, skills, topics) can be fixed; the rest is shown as read.
// defaultOpen: open after an upload, closed for a preset (ours, already checked)
export function ProfileOverview({ defaultOpen }: { defaultOpen: boolean }) {
  const profile = useInterviewStore((state) => state.profile);
  const updateProfile = useInterviewStore((state) => state.updateProfile);

  if (!profile) {
    return null;
  }

  return (
    <Card>
      <Collapsible key={String(defaultOpen)} defaultOpen={defaultOpen}>
        <CardHeader>
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-4 text-left">
            <span className="flex flex-col gap-1">
              <CardTitle>From the CV</CardTitle>
              <CardDescription>
                What the interviewer knows about {profile.first_name ?? "you"}. Is this right?
              </CardDescription>
            </span>
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open:rotate-180" />
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="flex flex-col gap-4 pt-4 text-sm">
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
              onRemove={(skill) =>
                updateProfile({ skills: profile.skills.filter((s) => s !== skill) })
              }
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
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
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
          <li key={item}>
            <Badge variant="secondary">
              {item}
              {canRemove && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${item}`}
                  onClick={() => onRemove(item)}
                  className="-mr-1.5 size-4 rounded-full text-muted-foreground"
                >
                  <XIcon />
                </Button>
              )}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}
