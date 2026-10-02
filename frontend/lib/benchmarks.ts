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

export type BarRow = { name: string; value: number; label: string; used?: boolean };

export const sttModels: BarRow[] = [
  { name: "Parakeet v2", value: 2.3, label: "2.3 % · 0.3 s", used: true },
  { name: "Whisper small.en", value: 4.7, label: "4.7 % · 1.1 s" },
  { name: "Whisper large-v3-turbo", value: 4.7, label: "4.7 % · 4.4 s" },
  { name: "Moonshine medium", value: 7.0, label: "7.0 % · 0.7 s" },
  { name: "Whisper distil-large-v3", value: 7.0, label: "7.0 % · 4.3 s" },
  { name: "Moonshine small", value: 14.0, label: "14.0 % · 0.5 s" },
  { name: "Moonshine base", value: 18.6, label: "18.6 % · 0.3 s" },
  { name: "Whisper tiny.en", value: 27.9, label: "27.9 % · 0.2 s" },
  { name: "Whisper base.en", value: 30.2, label: "30.2 % · 0.4 s" },
];

export type LatencyRow = {
  name: string;
  stt: number;
  reply: number;
  speech: number;
  range: string;
  used?: boolean;
};

// typical seconds per step; range = the whole wait, fastest to slowest
export const latency: LatencyRow[] = [
  { name: "Default voice", stt: 0.3, reply: 1.45, speech: 0.6, range: "1.8–2.9 s", used: true },
  { name: "Cloud voice", stt: 0.3, reply: 1.45, speech: 2.6, range: "2.8–5.9 s" },
];

// gpt-5-mini: median seconds, cost per 100 replies
export const effortLevels: BarRow[] = [
  { name: "Minimal", value: 1.3, label: "1.3 s · $0.03", used: true },
  { name: "Low", value: 2.4, label: "2.4 s · $0.05" },
  { name: "Medium", value: 4.3, label: "4.3 s · $0.09" },
];

export type PairedRow = {
  name: string;
  a: number;
  aLabel: string;
  b: number;
  bLabel: string;
  used?: boolean;
};

const pair = (name: string, a: number, b: number, digits = 0): PairedRow => ({
  name,
  a,
  aLabel: a.toFixed(digits),
  b,
  bLabel: b.toFixed(digits),
});

// years of experience the CV profile counted; a = low effort (correct), b = minimal
export const cvYears: PairedRow[] = [
  pair("“2018 – present”", 8, 6),
  pair("“2016 – now”", 10, 7),
  pair("“2022 – present”", 4, 2),
  pair("“2021 – present”", 5, 3),
];

export type BeforeAfterMeasure = { name: string; hint: string; rows: PairedRow[] };

// Jev's probability per reply, mean; a = before the two prompt fixes, b = after
export const promptFixes: BeforeAfterMeasure[] = [
  {
    name: "Praises weak answers",
    hint: 'Lower is better. Mean over the vague and "don\'t know" answers.',
    rows: [
      { ...pair("Zero-shot", 0.69, 0.07, 2), used: true },
      pair("Few-shot", 0.53, 0.04, 2),
      pair("Chain-of-thought", 0.88, 0.05, 2),
      pair("Persona", 0.72, 0.05, 2),
      pair("Self-critique", 0.67, 0.08, 2),
    ],
  },
  {
    name: "Invents team facts",
    hint: "Lower is better. When the candidate asks about the team.",
    rows: [
      { ...pair("Zero-shot", 0.96, 0.04, 2), used: true },
      pair("Few-shot", 0.96, 0.03, 2),
      pair("Chain-of-thought", 0.96, 0.03, 2),
      pair("Persona", 0.96, 0.04, 2),
      pair("Self-critique", 0.97, 0.03, 2),
    ],
  },
  {
    name: "Overall quality",
    hint: 'Higher is better. Jev\'s "good reply" score, mean over all 90 replies.',
    rows: [
      { ...pair("Zero-shot", 0.83, 0.93, 2), used: true },
      pair("Few-shot", 0.84, 0.92, 2),
      pair("Chain-of-thought", 0.84, 0.93, 2),
      pair("Persona", 0.83, 0.92, 2),
      pair("Self-critique", 0.83, 0.93, 2),
    ],
  },
];
