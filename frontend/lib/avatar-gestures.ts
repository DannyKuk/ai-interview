import type { TalkingHead } from "@met4citizen/talkinghead";

export const THINKING = "thinking";
const THINKING_DONE = "thinking-done";

// TalkingHead's own thinking aims the hand at a point so close to the head that the arm solver
// sometimes puts it behind the head, and makes a fist. Ours: the same thinking face, an
// open hand under the chin.
export function addInterviewGestures(head: TalkingHead) {
  head.animEmojis[THINKING] = {
    dt: [500, 1500],
    // a longer playGesture() stretches only the hold, not the hand's way up. TalkingHead
    // reads this from template.rescale (its own emojis put it at the top, where it's
    // ignored: everything stretches, and with 30 s the hand needs 7.5 s to come up)
    template: { rescale: [0, 1] },
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

  head.animEmojis[THINKING_DONE] = {
    dt: [800],
    vs: { handRight: [{ d: 800 }] }, // no target: the arm goes back to its rest pose
  };
}

export function listenTo(
  head: TalkingHead,
  analyser: AnalyserNode,
  onChange?: (event: string) => void, // for the test page: what TalkingHead detected
) {
  // a pause = quieter than its threshold for 1 s (its default 2 s feels late for a nod)
  head.startListening(analyser, { listeningSilenceThresholdMs: 1000 }, (event) => {
    if (event === "stop") {
      head.playGesture("yes");
    }
    onChange?.(event);
  });
}

// ends the thinking pose early. stopGesture() alone removes the animation before its
// "hand down" step, so the arm would stay at the chin: a short one brings it down
export function stopThinking(head: TalkingHead) {
  head.stopGesture();
  head.playGesture(THINKING_DONE, 0.8);
}
