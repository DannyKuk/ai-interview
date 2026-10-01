"use client";

import type { Mood, TalkingHead } from "@met4citizen/talkinghead";
import dynamic from "next/dynamic";
import Image from "next/image";

import { Equalizer } from "@/components/interview/equalizer";
import { SelfView } from "@/components/interview/self-view";
import type { InterviewSettings } from "@/lib/api";

// A still of the same avatar, rendered at the stage's height: shows while three.js and
// the model load (~2-3 s), and stays if WebGL fails
function Portrait() {
  return (
    <Image
      src="/avatars/brunette.png"
      alt=""
      fill
      unoptimized // already small, and a re-encode could shift it against the 3D avatar
      className="object-contain"
    />
  );
}

// three.js only loads on this page, and only in the browser
const TalkingHeadAvatar = dynamic(
  async () => (await import("@/components/avatar/talking-head")).TalkingHeadAvatar,
  { ssr: false, loading: () => <Portrait /> },
);

// "Goldman Sax" -> /backgrounds/goldman-sax.webp
function backgroundOf(company: string): string {
  return `/backgrounds/${company.toLowerCase().replaceAll(" ", "-")}.webp`;
}

type Persona = InterviewSettings["persona"];

const MOOD: Record<Persona, Mood> = { strict: "angry", neutral: "neutral", friendly: "happy" };

type Props = {
  company?: InterviewSettings["company"]; // none: a plain backdrop
  persona?: Persona; // none: TalkingHead's default mood (neutral)
  avatar?: boolean; // false: only the still image, three.js isn't loaded
  onReady?: (head: TalkingHead | null) => void; // to make it speak
  interviewer: string | null;
  speaking: boolean;
  candidate: string | null;
  mic: AnalyserNode | null; // the candidate's mic while recording
};

export function InterviewStage({
  company,
  persona,
  avatar = true,
  onReady,
  interviewer,
  speaking,
  candidate,
  mic,
}: Props) {
  return (
    <div
      data-speaking={speaking ? "" : undefined}
      className="speaking-edge relative min-h-[420px] overflow-hidden rounded-xl bg-card"
    >
      {company && (
        <div
          className="stage-office"
          style={{ backgroundImage: `url(${backgroundOf(company)})` }}
        />
      )}
      <div className="stage-cone" />
      <div className="absolute inset-0">
        {avatar ? (
          <TalkingHeadAvatar
            onReady={onReady}
            placeholder={<Portrait />}
            mood={persona && MOOD[persona]}
          />
        ) : (
          <Portrait />
        )}
      </div>
      <div className="film-grain" />
      {interviewer && (
        <span className="absolute top-3 left-3 inline-flex items-center gap-2 rounded-lg bg-background/70 px-2.5 py-1 text-sm font-medium backdrop-blur">
          {speaking && <Equalizer />}
          {interviewer}
          <span className="font-normal text-muted-foreground">{company}</span>
        </span>
      )}
      <SelfView name={candidate} mic={mic} />
    </div>
  );
}
