import type { HeadAudio } from "@met4citizen/headaudio/dist/headaudio.min.mjs";
import type { TalkingHead } from "@met4citizen/talkinghead";

// Gemini's voice is audio only, without mouth-shape timings. HeadAudio (an AudioWorklet)
// listens to the avatar's speech output and detects the mouth shapes from the sound.
// Its worklet and model load by URL: public/headaudio/, copied from node_modules
export async function createAudioLipsync(head: TalkingHead): Promise<HeadAudio> {
  const { HeadAudio } = await import("@met4citizen/headaudio/dist/headaudio.min.mjs");
  await head.audioCtx.audioWorklet.addModule("/headaudio/headworklet.min.mjs");
  const headaudio = new HeadAudio(head.audioCtx, {
    // louder than -40 dB = speech, quieter than -60 dB = silence (closed mouth)
    parameterData: { vadGateActiveDb: -40, vadGateInactiveDb: -60 },
  });
  await headaudio.loadModel("/headaudio/model-en-mixed.bin");

  headaudio.onvalue = (key, value) => {
    Object.assign(head.mtAvatar[key], { newvalue: value, needsUpdate: true });
  };
  head.opt.update = headaudio.update.bind(headaudio);

  return headaudio;
}
