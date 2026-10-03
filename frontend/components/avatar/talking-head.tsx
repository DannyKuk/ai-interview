"use client";

import { TalkingHead, type Mood } from "@met4citizen/talkinghead";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { Bone, Vector3 } from "three";

import { addInterviewGestures } from "@/lib/avatar-gestures";
import type { AvatarModel, Retarget } from "@/lib/avatars";
import { retarget as retargetSkeleton } from "@/lib/retargeter.mjs";

type Status = "loading" | "ready" | "error";

type Props = {
  // the head once the avatar is on screen (to make it speak), null after unmount
  onReady?: (head: TalkingHead | null) => void;
  placeholder?: ReactNode;
  mood?: Mood; // the face's base expression, also when it changes later
  model: AvatarModel; // a new one rebuilds the head
};

// TalkingHead's newer versions do this inside showAvatar(); on 1.7 it runs right after.
// That holds: of the bones, 1.7 only animates the hips' position, never the rest pose
function retarget(head: TalkingHead, transforms: Retarget) {
  retargetSkeleton(head.armature, transforms);
  // what 1.7 took from the old skeleton at load: the arm solver's bones, and the eye
  // height the camera frames by
  head.ikMesh.traverse((object) => {
    if (object instanceof Bone) {
      object.position.copy(head.armature.getObjectByName(object.name)!.position);
    }
  });
  head.avatarHeight = head.objectLeftEye.getWorldPosition(new Vector3()).y + 0.2;
  head.setView(head.viewName);
}

function scaleBlinks(head: TalkingHead, strength: number) {
  for (const mesh of head.morphs) {
    for (const name of ["eyeBlinkLeft", "eyeBlinkRight"]) {
      const index = mesh.morphTargetDictionary?.[name];
      if (index === undefined) {
        continue;
      }
      for (const kind of ["position", "normal"] as const) {
        const shape = mesh.geometry.morphAttributes[kind]?.[index];
        if (shape) {
          for (let i = 0; i < shape.array.length; i++) {
            shape.array[i] *= strength;
          }
          shape.needsUpdate = true;
        }
      }
    }
  }
}

// The 3D interviewer. three.js and TalkingHead need the browser, so load this
// only through next/dynamic with ssr: false
export function TalkingHeadAvatar({ onReady, placeholder, mood, model }: Props) {
  const { url, body, baseline, retarget: transforms, blinkStrength, skipPoses } = model;
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
        if (transforms) {
          retarget(head, transforms);
        }
        if (blinkStrength) {
          scaleBlinks(head, blinkStrength);
        }
        skipPoses?.forEach((pose) => (head.poseTemplates[pose] = head.poseTemplates.side));
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
  }, [url, body, baseline, transforms, blinkStrength, skipPoses]);

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
