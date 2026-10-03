"use client";

import type { Mood, TalkingHead } from "@met4citizen/talkinghead";
import { useEffect, useState } from "react";

import type { AvatarModel } from "@/components/avatar/talking-head";
import { InterviewStage } from "@/components/interview/interview-stage";
import { OptionSelect } from "@/components/option-select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRecorder } from "@/hooks/use-recorder";
import type { InterviewSettings } from "@/lib/api";
import { listenTo, stopThinking, THINKING } from "@/lib/avatar-gestures";
import { synthesizeHeadTts, type HeadTtsVoice } from "@/lib/headtts";

// Avatar playground: the interview's stage, any office, any sentence straight to HeadTTS,
// thinking and listening as in the interview. No LLM, no backend, no interview needed

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

type AvatarName = "Brunette" | "Businessman" | "AvatarSDK";

// candidates for the interviewer, each with its HeadTTS voice
const AVATARS: Record<AvatarName, { model: AvatarModel; voice: HeadTtsVoice }> = {
  Brunette: { model: { url: "/avatars/brunette.glb", body: "F" }, voice: "af_heart" },
  Businessman: { model: { url: "/avatars/businessman.glb", body: "M" }, voice: "am_michael" },
  AvatarSDK: {
    model: {
      url: "/avatars/avatarsdk.glb",
      body: "M",
      // his neck bends forward. TalkingHead's demo straightens it with a neck retarget,
      // which 1.7 doesn't have yet, so the head is lifted further instead
      baseline: { headRotateX: -0.3, eyeBlinkLeft: 0.05, eyeBlinkRight: 0.05 },
    },
    voice: "am_michael",
  },
};

const MOODS: Mood[] = ["neutral", "happy", "angry", "sad", "fear", "disgust", "love", "sleep"];

// candidates for the interview: TalkingHead's names (hand gestures, face / head animations)
const GESTURES = [
  { label: "🤔 Thinking (ours, chin)", name: THINKING },
  { label: "🤔 Thinking (TalkingHead)", name: "🤔" },
  { label: "Nod", name: "yes" },
  { label: "Head shake", name: "no" },
  { label: "🙂 Smile", name: "🙂" },
  { label: "😊 Warm smile", name: "😊" },
  { label: "😐 Straight face", name: "😐" },
  { label: "👀 Eyes", name: "👀" },
  { label: "🙄 Eye roll", name: "🙄" },
  { label: "👍 Thumbs up", name: "thumbup" },
  { label: "👌 OK", name: "ok" },
  { label: "☝️ Index", name: "index" },
  { label: "🤷 Shrug", name: "shrug" },
  { label: "✋ Hand up", name: "handup" },
];

// stands in for the LLM: in the interview she thinks until the first sentence plays
const EXTRA_WAITS = ["0 s", "1.5 s", "3 s"] as const;
type ExtraWait = (typeof EXTRA_WAITS)[number];

// TalkingHead's defaults for "the candidate talks" / "pauses" (its volume scale 0..255)
const TALKING_ABOVE = 75;
const PAUSE_BELOW = 40;

// lips closed (P, B, M) and teeth on lip (F, V) are the easiest mouth shapes to check
const SAMPLE =
  "Hi, I'm Sam. Before we begin, maybe tell me about a project that made you proud, and what you would do differently today.";

export default function AvatarTestPage() {
  const [head, setHead] = useState<TalkingHead | null>(null);
  const [company, setCompany] = useState<Company>("Netflux");
  const [avatar, setAvatar] = useState<AvatarName>("Brunette");
  const [mood, setMood] = useState<Mood>("neutral");
  const [text, setText] = useState(SAMPLE);
  const [busy, setBusy] = useState(false);
  const [extraWait, setExtraWait] = useState<ExtraWait>("1.5 s");
  const recorder = useRecorder();
  const [volume, setVolume] = useState(0);
  const [events, setEvents] = useState<string[]>([]); // newest first

  // listening as in the interview, plus what TalkingHead hears, to tune its thresholds
  useEffect(() => {
    const analyser = recorder.analyser;
    if (!head || !analyser) {
      return;
    }

    const started = performance.now();
    listenTo(head, analyser, (event) => {
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      setEvents((previous) => [`${seconds} s ${event}`, ...previous].slice(0, 6));
    });
    const timer = setInterval(() => setVolume(Math.round(head.listeningVolume)), 100);

    return () => {
      clearInterval(timer);
      head.stopListening();
    };
  }, [head, recorder.analyser]);

  async function speak() {
    if (!head) {
      return;
    }

    setBusy(true);
    // as in the interview: she thinks until the reply plays
    head.playGesture(THINKING, 30);
    try {
      // the browser only lets audio start after a click
      await head.audioCtx.resume();
      const [speech] = await Promise.all([
        // nothing cancels it here: HeadTTS's own time limit still applies
        synthesizeHeadTts(text, AVATARS[avatar].voice, new AbortController().signal),
        new Promise((resolve) => setTimeout(resolve, parseFloat(extraWait) * 1000)),
      ]);
      const audio = await head.audioCtx.decodeAudioData(speech.audio);
      stopThinking(head);
      head.speakAudio({ ...speech, audio });
    } catch (error) {
      stopThinking(head);
      console.error("Speaking failed", error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-16">
      <InterviewStage
        company={company}
        model={AVATARS[avatar].model}
        onReady={setHead}
        interviewer="Mia Laurent"
        speaking={busy}
        candidate={null}
        mic={null}
      />
      <div className="grid grid-cols-3 gap-4">
        <OptionSelect
          id="avatar"
          label="Avatar"
          options={Object.keys(AVATARS) as AvatarName[]}
          value={avatar}
          onChange={(next) => {
            setAvatar(next);
            setMood("neutral"); // the new head starts neutral
          }}
          disabled={busy}
        />
        <OptionSelect
          id="company"
          label="Office"
          options={COMPANIES}
          value={company}
          onChange={setCompany}
        />
        <OptionSelect
          id="mood"
          label="Mood"
          options={MOODS}
          value={mood}
          onChange={(next) => {
            setMood(next);
            head?.setMood(next);
          }}
          disabled={!head}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {GESTURES.map(({ label, name }) => (
          <Button
            key={name}
            variant="outline"
            size="sm"
            onClick={() => head?.playGesture(name)}
            disabled={!head}
          >
            {label}
          </Button>
        ))}
        <Button variant="outline" size="sm" onClick={() => head?.lookAhead(2000)} disabled={!head}>
          Look away 2 s
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => head?.lookAtCamera(2000)}
          disabled={!head}
        >
          Eye contact 2 s
        </Button>
      </div>
      <Textarea value={text} onChange={(event) => setText(event.target.value)} rows={3} />
      <div className="flex items-end gap-4">
        <OptionSelect
          id="extra-wait"
          label="Extra thinking time (the LLM)"
          options={[...EXTRA_WAITS]}
          value={extraWait}
          onChange={setExtraWait}
        />
        <Button onClick={speak} disabled={!head || busy || !text.trim()}>
          {busy ? "Thinking…" : "Speak"}
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <Button
          variant={recorder.status === "recording" ? "destructive" : "outline"}
          onClick={() => (recorder.status === "recording" ? recorder.stop() : recorder.start())}
          disabled={!head || recorder.status === "starting"}
          className="self-start"
        >
          {recorder.status === "recording" ? "Stop listening" : "Listen (mic)"}
        </Button>
        {recorder.error && <p className="text-sm text-destructive">{recorder.error}</p>}
        {recorder.status === "recording" && (
          <p className="font-mono text-sm text-muted-foreground">
            volume {volume} (talking above {TALKING_ABOVE}, pause below {PAUSE_BELOW}) ·{" "}
            {events.join(" · ") || "no events yet"}
          </p>
        )}
      </div>
    </main>
  );
}
