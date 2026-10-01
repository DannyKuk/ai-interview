"use client";

import type { Mood, TalkingHead } from "@met4citizen/talkinghead";
import dynamic from "next/dynamic";
import Image from "next/image";

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
  onReady?: (head: TalkingHead | null) => void; // to make it speak
};

// the interviewer in the company's office
export function InterviewStage({ company, persona, onReady }: Props) {
  return (
    <div
      className="relative h-[360px] overflow-hidden rounded-xl bg-muted bg-cover bg-center"
      style={company ? { backgroundImage: `url(${backgroundOf(company)})` } : undefined}
    >
      <TalkingHeadAvatar
        onReady={onReady}
        placeholder={<Portrait />}
        mood={persona && MOOD[persona]}
      />
    </div>
  );
}
