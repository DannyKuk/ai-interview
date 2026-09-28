"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { InterviewSettings } from "@/lib/api";

type InterviewState = {
  settings: InterviewSettings | null; // null until the setup page fills in the backend defaults
  sessionId: string | null; // one per interview, the backend's cost cap counts per session
  updateSettings: (patch: Partial<InterviewSettings>) => void;
  startInterview: () => void;
  reset: () => void;
};

export const useInterviewStore = create<InterviewState>()(
  persist(
    (set) => ({
      settings: null,
      sessionId: null,
      updateSettings: (patch) =>
        set((state) => ({ settings: { ...state.settings, ...patch } as InterviewSettings })),
      startInterview: () => set({ sessionId: crypto.randomUUID() }),
      reset: () => set({ settings: null, sessionId: null }),
    }),
    {
      name: "interview",
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
