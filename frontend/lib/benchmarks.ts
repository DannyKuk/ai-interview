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
  local: [writeUp("local models", "local-models.md")],
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

// Jev's good-reply score, 27 replies each; first words = median seconds.
// Local = one AMD RX 7900 XTX (24 GB) in LM Studio; gpt-oss-120b only partly on the card
export const localModels: BarRow[] = [
  { name: "gpt-oss-120b", value: 0.94, label: "0.94 · 6.6 s" },
  { name: "gpt-5-mini (cloud)", value: 0.93, label: "0.93 · 0.8 s", used: true },
  { name: "Qwen 3.8 27B", value: 0.93, label: "0.93 · 1.6 s" },
  { name: "Gemma 4 31B", value: 0.93, label: "0.93 · 2.4 s" },
  { name: "gpt-oss-20b", value: 0.91, label: "0.91 · 0.5 s" },
  { name: "Bonsai 27B (1-bit)", value: 0.87, label: "0.87 · 2.3 s" },
  { name: "GLM 4.7 Flash", value: 0.86, label: "0.86 · 0.3 s" },
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

// at the app's settings (minimal, challenge signal on): Jev's P that the reply praises a
// weak answer, mean over the vague and "don't know" answers; quality = good reply, all
export const promptTechniques: BarRow[] = [
  { name: "Zero-shot", value: 0.05, label: "0.05 · quality 0.93", used: true },
  { name: "Persona", value: 0.28, label: "0.28 · quality 0.92" },
  { name: "Few-shot", value: 0.39, label: "0.39 · quality 0.92" },
  { name: "Chain-of-thought", value: 0.39, label: "0.39 · quality 0.93" },
  { name: "Self-critique", value: 0.43, label: "0.43 · quality 0.94" },
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

const mistakes = (name: string, invented: number, praised: number): PairedRow => ({
  name,
  a: invented / 10,
  aLabel: `${invented} of 10`,
  b: praised / 3,
  bLabel: `${praised} of 3`,
});

// a = runs whose sample answer invented details the candidate never said (of 10),
// b = nonsense answers the feedback praised (of 3)
export const feedbackMistakes: PairedRow[] = [
  { ...mistakes("App's prompt", 10, 0), used: true },
  mistakes("Few-shot", 10, 1),
  mistakes("Persona", 10, 1),
  mistakes("Chain-of-thought", 8, 1),
  mistakes("Self-critique", 5, 2),
];

export type JailbreakStep = { title: string; value: string; label: string; used?: boolean };

export const jailbreakSteps: JailbreakStep[] = [
  {
    title: "Round 1 · before the fix",
    value: "43 / 44",
    label: "passed. A faked chat history got through in 1 of 5 runs.",
  },
  {
    title: "The fix",
    value: "Signed",
    label: "The server signs the transcript, so an edited history is rejected.",
  },
  {
    title: "Round 2 · after the fix",
    value: "45 / 45",
    label: "passed, the faked history included, and again in a final round on Oct 3.",
    used: true,
  },
];

export type GuardRow = { way: string; guard: string };

export const guards: GuardRow[] = [
  {
    way: "Chat message (typed or spoken)",
    guard: "Jev checks it → sent to the model as data, not instructions → reply checked for leaks",
  },
  { way: "Earlier messages", guard: "Signed by the server, edits are rejected" },
  {
    way: "CV (PDF) and job description",
    guard: "File type and size checked → Jev checks the text",
  },
  { way: "Interview plan", guard: "Signed by the server" },
];

// Jev's probability for test answers; the interviewer pushes back at a wrong claim ≥ 0.8
// or a contradiction ≥ 0.5
export type ChallengeExample = {
  quote: string;
  kind: string;
  signal: string;
  value: number;
  threshold: number;
  outcome: string;
  tone: "push" | "note" | "none";
};

export const challengeExamples: ChallengeExample[] = [
  {
    quote:
      "SQLite handles any number of simultaneous writes without locking, so I never had to think about concurrency.",
    kind: "Wrong: SQLite lets only one writer in at a time",
    signal: "wrong claim",
    value: 0.94,
    threshold: 0.8,
    outcome: "Asks how they handled it",
    tone: "push",
  },
  {
    quote: "Since HTTP is a stateful protocol, … I wouldn't need cookies or tokens for that.",
    kind: "Wrong: HTTP is stateless",
    signal: "wrong claim",
    value: 0.98,
    threshold: 0.8,
    outcome: "Asks how they handled it",
    tone: "push",
  },
  {
    quote: "typeof null returns 'object', which is an old bug in the language.",
    kind: "True, but sounds odd",
    signal: "wrong claim",
    value: 0.05,
    threshold: 0.8,
    outcome: "Moves on",
    tone: "none",
  },
  {
    quote: "With React 19 I'd use an Action and the useActionState hook.",
    kind: "True, but newer than the model",
    signal: "wrong claim",
    value: 0.2,
    threshold: 0.8,
    outcome: "Moves on · “couldn't verify”",
    tone: "note",
  },
  {
    quote: "Honestly, I've never written any Python myself. A friend built the whole tracker.",
    kind: "After saying they built it in Flask",
    signal: "contradiction",
    value: 0.97,
    threshold: 0.5,
    outcome: "Asks which is true",
    tone: "push",
  },
  {
    quote: "A friend … reviewed my code once …, but I wrote the app myself.",
    kind: "A new detail, not a contradiction",
    signal: "contradiction",
    value: 0.07,
    threshold: 0.5,
    outcome: "Moves on",
    tone: "none",
  },
];
