// Plays sentences one after another. The next sentence is synthesized while the
// current one plays, but only one ahead: on barge-in, or with Gemini's cost
// per sentence, audio made further ahead would be thrown away.
// Engine-agnostic: the TTS call and the playback are passed in (HeadTTS or Gemini,
// with its fallback to HeadTTS inside `synthesize`)

export type Synthesize<Clip> = (text: string, signal: AbortSignal) => Promise<Clip>;
export type Play<Clip> = (clip: Clip, signal: AbortSignal) => Promise<void>;

export type SpeechQueueEvents = {
  onSentence?: (text: string) => void; // starts playing: for the caption
  onSpeakingChange?: (speaking: boolean) => void; // for the avatar, the mic, …
  onError?: (error: unknown, text: string) => void; // that sentence is skipped
};

type Item<Clip> = { text: string; clip?: Promise<Clip> };

export class SpeechQueue<Clip> {
  private items: Item<Clip>[] = [];
  private controller = new AbortController();
  private running = false;

  constructor(
    private readonly synthesize: Synthesize<Clip>,
    private readonly play: Play<Clip>,
    private readonly events: SpeechQueueEvents = {},
  ) {}

  add(text: string): void {
    this.items.push({ text });
    if (this.running) {
      this.prepare(this.items[0]); // playing already: this one may be next
    } else {
      void this.run();
    }
  }

  // barge-in / leaving: silence now, drop everything, cancel the TTS calls
  stop(): void {
    this.controller.abort();
    this.controller = new AbortController();
    this.items = [];
  }

  private prepare(item: Item<Clip> | undefined): void {
    if (!item || item.clip) return;
    item.clip = this.synthesize(item.text, this.controller.signal);
    item.clip.catch(() => {}); // handled when it's played; no "unhandled rejection" before that
  }

  private async run(): Promise<void> {
    this.running = true;
    this.events.onSpeakingChange?.(true);
    try {
      while (this.items.length) {
        const signal = this.controller.signal;
        const item = this.items.shift()!;
        this.prepare(item);
        this.prepare(this.items[0]); // the one after it, while this one plays
        try {
          const clip = await item.clip!;
          if (signal.aborted) continue;
          this.events.onSentence?.(item.text);
          await this.play(clip, signal);
        } catch (error) {
          if (!signal.aborted) this.events.onError?.(error, item.text);
        }
      }
    } finally {
      this.running = false;
      this.events.onSpeakingChange?.(false);
    }
  }
}
