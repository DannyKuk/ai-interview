// TalkingHead ships plain JavaScript without types: only the parts we use
declare module "@met4citizen/talkinghead" {
  import type { Object3D } from "three";

  export type TalkingHeadOptions = {
    lipsyncLang?: string;
    // language files it loads by a computed path, which a bundler can't follow
    lipsyncModules?: string[];
    cameraView?: "full" | "mid" | "upper" | "head";
    cameraRotateEnable?: boolean;
  };

  // the face's base expression
  export type Mood = "neutral" | "happy" | "angry" | "sad" | "fear" | "disgust" | "love" | "sleep";

  export type AvatarOptions = {
    url: string;
    body: "M" | "F";
    avatarMood?: Mood;
    lipsyncLang?: string;
    // resting values of morph targets and head pose (e.g. headRotateX), to fit a model
    baseline?: Record<string, number>;
  };

  // audio plus word and viseme (mouth shape) timings in ms, as HeadTTS returns them
  export type SpeakAudioInput = {
    audio: AudioBuffer;
    words?: string[];
    wtimes?: number[];
    wdurations?: number[];
    visemes?: string[];
    vtimes?: number[];
    vdurations?: number[];
    markers?: (() => void)[];
    mtimes?: number[];
  };

  export class TalkingHead {
    constructor(node: HTMLElement, options?: TalkingHeadOptions);
    audioCtx: AudioContext;
    audioSpeechGainNode: GainNode; // the speech output: HeadAudio listens here
    // the morph targets (mouth shapes, …) by name: newvalue is applied on the next frame
    mtAvatar: Record<string, { newvalue?: number; needsUpdate?: boolean }>;
    opt: { update: ((dt: number) => void) | null };
    // the loaded model and what TalkingHead derived from it at load (for the retarget)
    armature: Object3D;
    ikMesh: Object3D; // the arm solver's copy of the skeleton
    objectLeftEye: Object3D;
    avatarHeight: number; // eye height + 0.2: the camera frames by it
    viewName: "full" | "mid" | "upper" | "head";
    setView(view: "full" | "mid" | "upper" | "head"): void;
    animEmojis: Record<string, object>;
    showAvatar(avatar: AvatarOptions): Promise<void>;
    speakAudio(speech: SpeakAudioInput): void;
    stopSpeaking(): void; // stops the clip, clears its queue, closes the lips
    setMood(mood: Mood): void;
    playGesture(name: string, seconds?: number): void;
    stopGesture(ms?: number): void; // back to the rest pose over ms
    // listening: eye contact, head moves with the candidate's voice (volume from analyser)
    startListening(
      analyser: AnalyserNode,
      options?: { listeningSilenceThresholdMs?: number },
      onChange?: (event: string) => void,
    ): void;
    stopListening(): void;
    listeningVolume: number; // 0..255, what its "start" / "stop" thresholds compare
    lookAhead(ms: number): void;
    lookAtCamera(ms: number): void;
    dispose(): void;
  }
}
