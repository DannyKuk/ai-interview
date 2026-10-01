"use client";

import type { TalkingHead } from "@met4citizen/talkinghead";
import { useState } from "react";

import { InterviewStage } from "@/components/interview/interview-stage";
import { OptionSelect } from "@/components/option-select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { InterviewSettings } from "@/lib/api";
import { synthesizeHeadTts } from "@/lib/headtts";

// Avatar playground: the interview's stage, any office, any sentence straight to HeadTTS.
// No LLM, no backend, no interview needed

type Company = InterviewSettings["company"];

const COMPANIES: Company[] = [
  "Guugle",
  "HeadBook",
  "Instakilogram",
  "Netflux",
  "Amazin",
  "Goldman Sax",
  "Tesler",
  "Starbacks",
];

// lips closed (P, B, M) and teeth on lip (F, V) are the easiest mouth shapes to check
const SAMPLE =
  "Hi, I'm Sam. Before we begin, maybe tell me about a project that made you proud, and what you would do differently today.";

export default function AvatarTestPage() {
  const [head, setHead] = useState<TalkingHead | null>(null);
  const [company, setCompany] = useState<Company>("Netflux");
  const [text, setText] = useState(SAMPLE);
  const [busy, setBusy] = useState(false);

  async function speak() {
    if (!head) {
      return;
    }

    setBusy(true);
    try {
      // the browser only lets audio start after a click
      await head.audioCtx.resume();
      // nothing cancels it here: HeadTTS's own time limit still applies
      const speech = await synthesizeHeadTts(text, "af_heart", new AbortController().signal);
      const audio = await head.audioCtx.decodeAudioData(speech.audio);
      head.speakAudio({ ...speech, audio });
    } catch (error) {
      console.error("Speaking failed", error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-16">
      <InterviewStage company={company} onReady={setHead} />
      <OptionSelect
        id="company"
        label="Office"
        options={COMPANIES}
        value={company}
        onChange={setCompany}
      />
      <Textarea value={text} onChange={(event) => setText(event.target.value)} rows={3} />
      <Button onClick={speak} disabled={!head || busy || !text.trim()} className="self-start">
        {busy ? "Synthesizing…" : "Speak"}
      </Button>
    </main>
  );
}
