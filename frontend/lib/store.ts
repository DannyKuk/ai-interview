"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type {
  CandidateProfile,
  ChatMessage,
  ChatResponse,
  FeedbackResponse,
  InterviewSettings,
  ModelSettings,
  PlanProgress,
  Preset,
  SignedPlan,
  Technique,
} from "@/lib/api";
import type { StreamedTurn } from "@/hooks/use-chat-stream";

export type EndReason = NonNullable<ChatResponse["ended"]>;

// a transcript line. An interviewer line also keeps which plan question it asks
// (0-based, from its turn's meta.progress), so /results can group the answers per
// question. The goodbye has none. Only for us: the backend's ChatMessage has no such field
export type TranscriptMessage = ChatMessage & { question?: number };

// what the dev panel changes: the prompt technique + the model call
export type DevSettings = { technique: Technique; modelSettings: ModelSettings };

// one finished turn for the dev panel, blocked ones too: what Jev said (guard log)
// and what the model call cost (cost breakdown, usage null = no model call)
export type TurnLogEntry = Pick<StreamedTurn, "guard" | "blocked" | "hint" | "ended" | "usage">;

// USD of the paid calls outside the chat, for the cost breakdown.
export type Costs = {
  cv?: number | null;
  plan?: number | null;
  feedback?: number | null;
  voice?: number; // the Gemini voice's sentences added up (estimated by the backend)
};

type InterviewState = {
  settings: InterviewSettings | null; // null until the setup page fills in the backend defaults
  presetId: string | null; // the picked preset card, null = none
  profile: CandidateProfile | null; // null = no CV: the plan works from role + company
  jobDescription: string; // "" = none
  sessionId: string | null; // one per interview, the backend's cost cap counts per session
  plan: SignedPlan | null; // the question list, sent back unchanged on every turn (signed)
  progress: PlanProgress | null; // where we are in the plan, from the last turn's meta
  messages: TranscriptMessage[]; // the transcript, sent as history on every turn
  // the server's signature over the transcript, sent back with the next turn: a changed
  // earlier line is rejected. null = no reply yet
  historySignature: string | null;
  ended: EndReason | null; // set once the interviewer has said goodbye
  interviewer: string | null; // the interviewer's name at the picked company
  startedAt: number | null; // ms timestamps, for the call's clock
  endedAt: number | null;
  feedback: FeedbackResponse | null; // kept, so a reload of /results doesn't recall the API
  dev: DevSettings | null; // null until the setup page fills in the backend defaults
  turnLog: TurnLogEntry[]; // oldest first
  costs: Costs; // CV, plan and feedback of this interview; the turns' costs are in turnLog
  // voice answers: false = stop sends the answer, true = it goes into the text field to
  // edit first. A preference: reset() keeps it
  reviewBeforeSending: boolean;
  // the TTS switch: false = HeadTTS (local, free, the default), true = Gemini (cloud).
  // A preference: reset() keeps it
  cloudVoice: boolean;
  // the interviewer's voice off: no TTS calls at all. A preference: reset() keeps it
  muted: boolean;
  // captions on the stage. A preference: reset() keeps it
  captions: boolean;
  // the interview's session column (cost, guard). A preference: reset() keeps it
  sessionPanel: boolean;
  // the 3D interviewer; off = a still image, three.js never loads (slow computers).
  // A preference: reset() keeps it
  avatar: boolean;
  updateSettings: (patch: Partial<InterviewSettings>) => void;
  choosePreset: (preset: Preset) => void;
  clearCandidate: () => void;
  setJobDescription: (jobDescription: string) => void;
  setProfile: (profile: CandidateProfile, cost: number | null) => void;
  updateProfile: (patch: Partial<CandidateProfile>) => void;
  startInterview: (plan: SignedPlan, cost: number | null, interviewer: string) => void;
  addMessage: (message: TranscriptMessage) => void;
  setHistorySignature: (historySignature: string | null) => void;
  setProgress: (progress: PlanProgress) => void;
  endInterview: (reason: EndReason) => void;
  setFeedback: (feedback: FeedbackResponse, cost: number | null) => void;
  updateDev: (patch: Partial<DevSettings>) => void;
  recordTurn: (turn: StreamedTurn) => void;
  setReviewBeforeSending: (review: boolean) => void;
  setCloudVoice: (cloudVoice: boolean) => void;
  setMuted: (muted: boolean) => void;
  setAvatar: (avatar: boolean) => void;
  setCaptions: (captions: boolean) => void;
  setSessionPanel: (sessionPanel: boolean) => void;
  addVoiceCost: (cost: number | null) => void;
  reset: () => void;
};

export const useInterviewStore = create<InterviewState>()(
  persist(
    (set) => ({
      settings: null,
      presetId: null,
      profile: null,
      jobDescription: "",
      sessionId: null,
      plan: null,
      progress: null,
      messages: [],
      historySignature: null,
      ended: null,
      interviewer: null,
      startedAt: null,
      endedAt: null,
      feedback: null,
      dev: null,
      turnLog: [],
      costs: {},
      reviewBeforeSending: false,
      cloudVoice: false,
      muted: false,
      avatar: true,
      captions: true,
      sessionPanel: false,

      updateSettings: (patch) =>
        set((state) => ({ settings: { ...state.settings, ...patch } as InterviewSettings })),
      // the preset is the candidate + the job; difficulty and question count stay as picked
      choosePreset: ({ id, settings: { company, role, persona }, profile, job_description }) =>
        set((state) => ({
          presetId: id,
          profile,
          costs: {},
          jobDescription: job_description,
          settings: { ...state.settings, company, role, persona } as InterviewSettings,
        })),
      clearCandidate: () => set({ presetId: null, profile: null, jobDescription: "", costs: {} }),
      setJobDescription: (jobDescription) => set({ jobDescription }),
      // an uploaded CV replaces the preset candidate; company, role and JD stay
      setProfile: (profile, cost) => set({ presetId: null, profile, costs: { cv: cost } }),
      // the candidate's own fixes - /plan checks the profile again
      updateProfile: (patch) =>
        set((state) => (state.profile ? { profile: { ...state.profile, ...patch } } : {})),
      startInterview: (plan, cost, interviewer) =>
        set((state) => ({
          sessionId: crypto.randomUUID(),
          plan,
          progress: null,
          messages: [],
          historySignature: null,
          ended: null,
          interviewer,
          startedAt: Date.now(),
          endedAt: null,
          feedback: null,
          turnLog: [],
          costs: { cv: state.costs.cv, plan: cost },
        })),
      addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
      setHistorySignature: (historySignature) => set({ historySignature }),
      setProgress: (progress) => set({ progress }),
      endInterview: (reason) =>
        set((state) => ({ ended: reason, endedAt: state.endedAt ?? Date.now() })),
      setFeedback: (feedback, cost) =>
        set((state) => ({ feedback, costs: { ...state.costs, feedback: cost } })),
      // kept across interviews (not cleared by startInterview): it's the experiment setup
      updateDev: (patch) => set((state) => ({ dev: { ...state.dev, ...patch } as DevSettings })),
      recordTurn: ({ guard, blocked, hint, ended, usage }) =>
        set((state) => ({ turnLog: [...state.turnLog, { guard, blocked, hint, ended, usage }] })),
      setReviewBeforeSending: (reviewBeforeSending) => set({ reviewBeforeSending }),
      setCloudVoice: (cloudVoice) => set({ cloudVoice }),
      setMuted: (muted) => set({ muted }),
      setAvatar: (avatar) => set({ avatar }),
      setCaptions: (captions) => set({ captions }),
      setSessionPanel: (sessionPanel) => set({ sessionPanel }),
      addVoiceCost: (cost) =>
        set((state) => ({
          costs: { ...state.costs, voice: (state.costs.voice ?? 0) + (cost ?? 0) },
        })),
      reset: () =>
        set({
          settings: null,
          presetId: null,
          profile: null,
          jobDescription: "",
          sessionId: null,
          plan: null,
          progress: null,
          messages: [],
          historySignature: null,
          ended: null,
          interviewer: null,
          startedAt: null,
          endedAt: null,
          feedback: null,
          dev: null,
          turnLog: [],
          costs: {},
        }),
    }),
    {
      name: "interview",
      storage: createJSONStorage(() => sessionStorage),
      // the server has no sessionStorage - load it after the first render (useStoreHydrated)
      skipHydration: true,
    },
  ),
);

// false on the server and the first client render, true once sessionStorage is loaded.
export function useStoreHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    async function rehydrate() {
      await useInterviewStore.persist.rehydrate();
      setHydrated(true);
    }
    rehydrate();
  }, []);
  return hydrated;
}
