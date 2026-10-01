// TalkingHead ships plain JavaScript without types: only the parts we use
declare module "@met4citizen/talkinghead" {
  export type TalkingHeadOptions = {
    lipsyncLang?: string;
    // language files it loads by a computed path, which a bundler can't follow
    lipsyncModules?: string[];
    cameraView?: "full" | "mid" | "upper" | "head";
    cameraRotateEnable?: boolean;
  };

  export type AvatarOptions = {
    url: string;
    body: "M" | "F";
    avatarMood?: string;
    lipsyncLang?: string;
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
  };

  export class TalkingHead {
    constructor(node: HTMLElement, options?: TalkingHeadOptions);
    audioCtx: AudioContext;
    showAvatar(avatar: AvatarOptions): Promise<void>;
    speakAudio(speech: SpeakAudioInput): void;
    dispose(): void;
  }
}
