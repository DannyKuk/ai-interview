"use client";

import type { TalkingHead } from "@met4citizen/talkinghead";
import dynamic from "next/dynamic";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { synthesizeHeadTts } from "@/lib/headtts";

// Lip-sync playground: any sentence straight to HeadTTS and the avatar, no LLM or interview.
// A client page because ssr: false isn't allowed in Server Components
const TalkingHeadAvatar = dynamic(
  async () => (await import("@/components/avatar/talking-head")).TalkingHeadAvatar,
  { ssr: false },
);

// lips closed (P, B, M) and teeth on lip (F, V) are the easiest mouth shapes to check
const SAMPLE =
  "Hi, I'm Sam. Before we begin, maybe tell me about a project that made you proud, and what you would do differently today.";

export default function AvatarTestPage() {
  const [head, setHead] = useState<TalkingHead | null>(null);
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
      <TalkingHeadAvatar onReady={setHead} />
      <Textarea value={text} onChange={(event) => setText(event.target.value)} rows={3} />
      <Button onClick={speak} disabled={!head || busy || !text.trim()} className="self-start">
        {busy ? "Synthesizing…" : "Speak"}
      </Button>
    </main>
  );
}
