"use client";

import type { Mood, TalkingHead } from "@met4citizen/talkinghead";
import dynamic from "next/dynamic";
import Image from "next/image";

import { Equalizer } from "@/components/interview/equalizer";
import { SelfView } from "@/components/interview/self-view";
import { StageCaption } from "@/components/interview/stage-caption";
import type { Interviewer, InterviewSettings } from "@/lib/api";
import { AVATARS } from "@/lib/avatars";

// A still of the same avatar, rendered at the stage's height: shows while three.js and
// the model load (~2-3 s), and stays if WebGL fails
function Portrait({ src }: { src: string }) {
  return (
    <Image
      src={src}
      alt=""
      fill
      unoptimized // already small, and a re-encode could shift it against the 3D avatar
      className="object-contain"
    />
  );
}

function RoundPortrait({ src, speaking }: { src: string; speaking: boolean }) {
  return (
    <div
      data-speaking={speaking ? "" : undefined}
      style={{ backgroundImage: `url(${src})` }}
      className="pulse-ring absolute top-[46%] left-1/2 aspect-square w-[clamp(130px,28%,200px)] -translate-1/2 rounded-full bg-muted bg-size-[140%] bg-position-[78%_54%] bg-no-repeat"
    />
  );
}

async function loadAvatar() {
  return (await import("@/components/avatar/talking-head")).TalkingHeadAvatar;
}

// three.js only loads on this page, and only in the browser. One per look: the still
// that shows while it loads can't get props
const TALKING_HEADS = {
  female: dynamic(loadAvatar, {
    ssr: false,
    loading: () => <Portrait src={AVATARS.female.portrait} />,
  }),
  male: dynamic(loadAvatar, {
    ssr: false,
    loading: () => <Portrait src={AVATARS.male.portrait} />,
  }),
};

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
  interviewer: Interviewer | null; // null: no name tag, the female avatar
  speaking: boolean;
  candidate: string | null;
  mic: AnalyserNode | null; // the candidate's mic while recording
  caption?: { spoken: string | null; dictation: string | null }; // none = captions off
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
  caption,
}: Props) {
  const gender = interviewer?.gender ?? "female";
  const look = AVATARS[gender];
  const TalkingHeadAvatar = TALKING_HEADS[gender];

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
            placeholder={<Portrait src={look.portrait} />}
            mood={persona && MOOD[persona]}
            model={look.model}
          />
        ) : (
          <RoundPortrait src={look.portrait} speaking={speaking} />
        )}
      </div>
      <div className="film-grain" />
      {interviewer && (
        <span className="absolute top-3 left-3 inline-flex items-center gap-2 rounded-lg bg-background/70 px-2.5 py-1 text-sm font-medium backdrop-blur">
          {speaking && <Equalizer />}
          {interviewer.name}
          <span className="font-normal text-muted-foreground">{company}</span>
        </span>
      )}
      <SelfView name={candidate} mic={mic} />
      {caption && <StageCaption spoken={caption.spoken} dictation={caption.dictation} />}
    </div>
  );
}
