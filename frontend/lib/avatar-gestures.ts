import type { TalkingHead } from "@met4citizen/talkinghead";

export const THINKING = "thinking";

// TalkingHead's own thinking aims the hand at a point so close to the head that the arm solver
// sometimes puts it behind the head, and makes a fist. Ours: the same thinking face, an
// open hand under the chin.
export function addInterviewGestures(head: TalkingHead) {
  head.animEmojis[THINKING] = {
    dt: [500, 1500],
    rescale: [0, 1], // a longer playGesture() stretches the hold, not the moves
    vs: {
      browDownLeft: [1],
      browOuterUpRight: [1],
      eyeSquintLeft: [0.6],
      mouthPressRight: [0.4],
      mouthRight: [0.5],
      handRight: [{ x: 0.1, y: 0.05, z: 0.12, d: 800 }, { d: 800 }],
      handFistRight: [0],
    },
  };
}
