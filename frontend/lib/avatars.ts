import type { AvatarOptions } from "@met4citizen/talkinghead";

import type { Interviewer, SpeakRequest } from "@/lib/api";
import type { HeadTtsVoice } from "@/lib/headtts";

// rest-pose fixes for a skeleton that isn't shaped like TalkingHead's reference one:
// bone name -> offsets (x, y, z in m, rx, ry, rz in rad), plus scaling + origin options
export type Retarget = Record<string, Record<string, number> | number>;

export type AvatarModel = Pick<AvatarOptions, "url" | "body" | "baseline"> & {
  retarget?: Retarget;
  blinkStrength?: number; // < 1: the model's blink shapes close the eyes too far per value
  skipPoses?: string[]; // TalkingHead's body poses that break the model: "side" instead
};

type Avatar = {
  model: AvatarModel;
  portrait: string; // a still of the same avatar: while the 3D one loads, or with it off
  voice: { headtts: HeadTtsVoice; gemini: SpeakRequest["voice"] }; // the same person in both
};

// the backend gives each company's interviewer a gender, this is their look and voice
export const AVATARS: Record<Interviewer["gender"], Avatar> = {
  female: {
    model: { url: "/avatars/brunette.glb", body: "F" },
    portrait: "/avatars/brunette.png",
    voice: { headtts: "af_heart", gemini: "Kore" },
  },
  male: {
    model: {
      url: "/avatars/avatarsdk.glb",
      body: "M",
      // TalkingHead's own settings for this model (its demo's siteconfig.js): his neck
      // bends forward and his shoulders sit differently from the reference skeleton
      retarget: {
        Neck: { z: -0.01, rx: -0.15 },
        Neck1: { z: -0.01, rx: -0.15 },
        Neck2: { z: -0.01, rx: -0.15 },
        LeftShoulder: { rz: -0.3 },
        RightShoulder: { rz: 0.3 },
        scaleToEyesLevel: 1.0,
        origin: { y: -0.1 },
      },
      baseline: { headRotateX: -0.04, eyeBlinkLeft: 0.05, eyeBlinkRight: 0.05 },
      // TalkingHead's resting lids (~0.2) already look sleepy on him; 0.6 still closes
      // them fully on a blink. Measured against the brunette at fixed lid values
      blinkStrength: 0.6,
      // the pose TalkingHead picks only for men: his arms go behind his back and the
      // shoulders fold in
      skipPoses: ["wide"],
    },
    portrait: "/avatars/avatarsdk.png",
    voice: { headtts: "am_michael", gemini: "Charon" },
  },
};

// null before an interview starts
export function avatarOf(interviewer: Interviewer | null): Avatar {
  return AVATARS[interviewer?.gender ?? "female"];
}
