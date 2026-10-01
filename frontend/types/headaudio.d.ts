declare module "@met4citizen/headaudio/dist/headaudio.min.mjs" {
  export class HeadAudio extends AudioWorkletNode {
    constructor(context: BaseAudioContext, options?: { parameterData?: Record<string, number> });
    loadModel(url: string): Promise<void>;
    update(dt: number): void; // eases the detected mouth shapes in and out, every frame
    onvalue: ((key: string, value: number) => void) | null;
  }
}
