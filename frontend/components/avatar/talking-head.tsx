"use client";

import { TalkingHead, type Mood } from "@met4citizen/talkinghead";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";

import { addInterviewGestures } from "@/lib/avatar-gestures";
import type { AvatarModel } from "@/lib/avatars";

type Status = "loading" | "ready" | "error";

type Props = {
  // the head once the avatar is on screen (to make it speak), null after unmount
  onReady?: (head: TalkingHead | null) => void;
  placeholder?: ReactNode;
  mood?: Mood; // the face's base expression, also when it changes later
  model: AvatarModel; // a new one rebuilds the head
};

// The 3D interviewer. three.js and TalkingHead need the browser, so load this
// only through next/dynamic with ssr: false
export function TalkingHeadAvatar({ onReady, placeholder, mood, model }: Props) {
  const { url, body, baseline } = model;
  const containerRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<TalkingHead | null>(null); // once it's on screen
  const [status, setStatus] = useState<Status>("loading");
  // always calls the latest onReady, without making the effect rebuild the avatar
  const reportHead = useEffectEvent((head: TalkingHead | null) => onReady?.(head));

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    const head = new TalkingHead(node, {
      lipsyncLang: "en",
      lipsyncModules: [], // HeadTTS sends the mouth shapes, so none are needed
      cameraView: "upper",
      cameraRotateEnable: false,
    });
    let disposed = false;

    // true once the avatar is on screen
    async function load(): Promise<boolean> {
      try {
        await head.showAvatar({
          url,
          body,
          baseline,
          avatarMood: "neutral",
          lipsyncLang: "en",
        });
        addInterviewGestures(head);
        if (!disposed) {
          headRef.current = head;
          setStatus("ready");
          reportHead(head);
        }

        return true;
      } catch (error) {
        if (!disposed) {
          console.error("Avatar failed to load", error);
          setStatus("error");
        }

        return false;
      }
    }
    const loading = load();

    // runs on unmount: frees the WebGL context, audio nodes and animation loop.
    // dispose() crashes while the avatar is still loading (it resets the pose), and
    // dev mode unmounts once right away, so wait for the load to finish
    return () => {
      disposed = true;
      headRef.current = null;
      reportHead(null);
      void loading.then((loaded) => loaded && head.dispose());
    };
  }, [url, body, baseline]);

  useEffect(() => {
    if (status === "ready" && mood) {
      headRef.current?.setMood(mood);
    }
  }, [status, mood]);

  return (
    <div className="relative size-full">
      <div ref={containerRef} className="size-full" />
      {status !== "ready" &&
        (placeholder ?? (
          <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            {status === "loading" ? "Loading the interviewer…" : "The avatar couldn't load."}
          </p>
        ))}
    </div>
  );
}
