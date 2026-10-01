"use client";

import { TalkingHead } from "@met4citizen/talkinghead";
import { useEffect, useEffectEvent, useRef, useState } from "react";

type Status = "loading" | "ready" | "error";

type Props = {
  // the head once the avatar is on screen (to make it speak), null after unmount
  onReady?: (head: TalkingHead | null) => void;
};

// The 3D interviewer. three.js and TalkingHead need the browser, so load this
// only through next/dynamic with ssr: false
export function TalkingHeadAvatar({ onReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
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
          url: "/avatars/brunette.glb",
          body: "F",
          avatarMood: "neutral",
          lipsyncLang: "en",
        });
        if (!disposed) {
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
      reportHead(null);
      void loading.then((loaded) => loaded && head.dispose());
    };
  }, []);

  return (
    <div className="relative h-[480px] w-full">
      <div ref={containerRef} className="size-full" />
      {status !== "ready" && (
        <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
          {status === "loading" ? "Loading the interviewer…" : "The avatar couldn't load."}
        </p>
      )}
    </div>
  );
}
