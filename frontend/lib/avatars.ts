import type { AvatarOptions } from "@met4citizen/talkinghead";

import type { Interviewer, SpeakRequest } from "@/lib/api";
import type { HeadTtsVoice } from "@/lib/headtts";

export type AvatarModel = Pick<AvatarOptions, "url" | "body" | "baseline">;

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
      // his neck bends forward. TalkingHead's demo straightens it with a neck retarget,
      // which 1.7 doesn't have yet, so the head is lifted further instead
      baseline: { headRotateX: -0.3, eyeBlinkLeft: 0.05, eyeBlinkRight: 0.05 },
    },
    portrait: "/avatars/avatarsdk.png",
    voice: { headtts: "am_michael", gemini: "Charon" },
  },
};

// null before an interview starts
export function avatarOf(interviewer: Interviewer | null): Avatar {
  return AVATARS[interviewer?.gender ?? "female"];
}
