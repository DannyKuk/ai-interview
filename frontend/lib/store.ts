"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { ChatMessage, ChatResponse, InterviewSettings } from "@/lib/api";

export type EndReason = NonNullable<ChatResponse["ended"]>;

type InterviewState = {
  settings: InterviewSettings | null; // null until the setup page fills in the backend defaults
  sessionId: string | null; // one per interview, the backend's cost cap counts per session
  messages: ChatMessage[]; // the transcript, sent as history on every turn
  ended: EndReason | null; // set once the interviewer has said goodbye
  updateSettings: (patch: Partial<InterviewSettings>) => void;
  startInterview: () => void;
  addMessage: (message: ChatMessage) => void;
  endInterview: (reason: EndReason) => void;
  reset: () => void;
};

export const useInterviewStore = create<InterviewState>()(
  persist(
    (set) => ({
      settings: null,
      sessionId: null,
      messages: [],
      ended: null,

      updateSettings: (patch) =>
        set((state) => ({ settings: { ...state.settings, ...patch } as InterviewSettings })),
      startInterview: () => set({ sessionId: crypto.randomUUID(), messages: [], ended: null }),
      addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
      endInterview: (reason) => set({ ended: reason }),
      reset: () => set({ settings: null, sessionId: null, messages: [], ended: null }),
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
    Promise.resolve(useInterviewStore.persist.rehydrate()).then(() => setHydrated(true));
  }, []);
  return hydrated;
}
