// Copied from the write-ups in docs/: after a new benchmark run, only this file changes.

const DOCS_URL = "https://github.com/DannyKuk/ai-interview/blob/main/docs";

export type WriteUp = { title: string; href: string };

const writeUp = (title: string, file: string): WriteUp => ({ title, href: `${DOCS_URL}/${file}` });

export const writeUps = {
  prompts: [
    writeUp("interviewer comparison", "prompt-comparison.md"),
    writeUp("feedback comparison", "feedback-prompt-comparison.md"),
  ],
  settings: [writeUp("settings experiments", "settings-experiments.md")],
  security: [
    writeUp("jailbreak tests", "jailbreak-tests.md"),
    writeUp("challenge signal", "challenge-signal.md"),
  ],
  voice: [
    writeUp("speech-to-text", "stt-decision.md"),
    writeUp("text-to-speech", "tts-decision.md"),
  ],
} satisfies Record<string, WriteUp[]>;

export type Tile = { value: string; unit?: string; label: string; used?: boolean };

export const tiles: Tile[] = [
  { value: "0.93", label: "Interviewer reply quality (was 0.83 before two prompt fixes)" },
  { value: "1.3 s", label: "Typical time for the interviewer to start answering" },
  { value: "45", unit: "/ 45", label: "Jailbreak tests the app passed, 5 runs each" },
  { value: "2.3 %", label: "Words misheard in voice answers, on your own machine" },
];
