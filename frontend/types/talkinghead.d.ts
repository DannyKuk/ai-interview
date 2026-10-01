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

  export class TalkingHead {
    constructor(node: HTMLElement, options?: TalkingHeadOptions);
    showAvatar(avatar: AvatarOptions): Promise<void>;
    dispose(): void;
  }
}
