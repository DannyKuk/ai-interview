"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { answersFrom } from "@/lib/answers";
import { ApiError, createFeedback, errorMessage } from "@/lib/api";
import { useInterviewStore } from "@/lib/store";

export type FeedbackError = { message: string; final: boolean };

// fetches the feedback once per interview (when enabled), then keeps it in the store
export function useFeedback(enabled: boolean) {
  const feedback = useInterviewStore((state) => state.feedback);
  const setFeedback = useInterviewStore((state) => state.setFeedback);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FeedbackError | null>(null);
  // dev mode runs effects twice: without this, that's two paid requests
  const requestedRef = useRef(false);

  const load = useCallback(async () => {
    const { sessionId, settings, plan, messages, ended } = useInterviewStore.getState();
    setLoading(true);
    setError(null);

    try {
      const { value: response, cost } = await createFeedback({
        session_id: sessionId!,
        settings: settings!,
        plan: plan!,
        answers: answersFrom(messages, ended),
      });
      // a new interview may have started while we waited: don't give it this one's feedback
      if (useInterviewStore.getState().sessionId === sessionId) {
        setFeedback(response, cost);
      }
    } catch (error) {
      const final =
        error instanceof ApiError &&
        (error.status === 422 || (error.status === 429 && !error.retryAfter));
      setError({ message: errorMessage(error), final });
    } finally {
      setLoading(false);
    }
  }, [setFeedback]);

  useEffect(() => {
    if (!enabled || requestedRef.current || useInterviewStore.getState().feedback) {
      return;
    }
    requestedRef.current = true;
    load();
  }, [enabled, load]);

  return { feedback, loading, error, retry: load };
}
