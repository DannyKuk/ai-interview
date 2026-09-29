"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type {
  ChatMessage,
  ChatResponse,
  InterviewSettings,
  ModelSettings,
  PlanProgress,
  SignedPlan,
  Technique,
} from "@/lib/api";
import type { StreamedTurn } from "@/hooks/use-chat-stream";

export type EndReason = NonNullable<ChatResponse["ended"]>;

// what the dev panel changes: the prompt technique + the model call
export type DevSettings = { technique: Technique; modelSettings: ModelSettings };

// what the dev panel shows about the last finished turn
export type TurnInfo = Pick<StreamedTurn, "blocked" | "hint" | "ended" | "usage">;

type InterviewState = {
  settings: InterviewSettings | null; // null until the setup page fills in the backend defaults
  sessionId: string | null; // one per interview, the backend's cost cap counts per session
  plan: SignedPlan | null; // the question list, sent back unchanged on every turn (signed)
  progress: PlanProgress | null; // where we are in the plan, from the last turn's meta
  messages: ChatMessage[]; // the transcript, sent as history on every turn
  ended: EndReason | null; // set once the interviewer has said goodbye
  dev: DevSettings | null; // null until the setup page fills in the backend defaults
  lastTurn: TurnInfo | null;
  sessionCost: number; // USD, sum of every turn's usage.cost
  updateSettings: (patch: Partial<InterviewSettings>) => void;
  startInterview: (plan: SignedPlan) => void;
  addMessage: (message: ChatMessage) => void;
  endInterview: (reason: EndReason) => void;
  updateDev: (patch: Partial<DevSettings>) => void;
  recordTurn: (turn: TurnInfo) => void;
  reset: () => void;
};

export const useInterviewStore = create<InterviewState>()(
  persist(
    (set) => ({
      settings: null,
      sessionId: null,
      plan: null,
      progress: null,
      messages: [],
      ended: null,
      dev: null,
      lastTurn: null,
      sessionCost: 0,

      updateSettings: (patch) =>
        set((state) => ({ settings: { ...state.settings, ...patch } as InterviewSettings })),
      startInterview: (plan) =>
        set({
          sessionId: crypto.randomUUID(),
          plan,
          progress: null,
          messages: [],
          ended: null,
          lastTurn: null,
          sessionCost: 0,
        }),
      addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
      endInterview: (reason) => set({ ended: reason }),
      // kept across interviews (not cleared by startInterview): it's the experiment setup
      updateDev: (patch) => set((state) => ({ dev: { ...state.dev, ...patch } as DevSettings })),
      recordTurn: ({ blocked, hint, ended, usage }) =>
        set((state) => ({
          lastTurn: { blocked, hint, ended, usage },
          sessionCost: state.sessionCost + (usage?.cost ?? 0),
        })),
      reset: () =>
        set({
          settings: null,
          sessionId: null,
          plan: null,
          progress: null,
          messages: [],
          ended: null,
          dev: null,
          lastTurn: null,
          sessionCost: 0,
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
