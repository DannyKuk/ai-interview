import type { components } from "@/lib/api-types";

export type AppConfig = components["schemas"]["AppConfig"];
export type ModelInfo = components["schemas"]["ModelInfo"];
export type ChatMessage = components["schemas"]["ChatMessage"];
export type ChatRequest = components["schemas"]["ChatRequest"];
export type ChatResponse = components["schemas"]["ChatResponse"];
export type InterviewSettings = components["schemas"]["InterviewSettings"];
export type ModelSettings = components["schemas"]["ModelSettings"];
export type Technique = ChatRequest["system_prompt"];
export type InterviewPlan = components["schemas"]["InterviewPlan"];
export type PlanRequest = components["schemas"]["PlanRequest"];
export type PlanProgress = components["schemas"]["PlanProgress"];
// FastAPI lists it twice (request + response body), both have the same shape
export type SignedPlan = components["schemas"]["SignedPlan-Output"];
export type AnsweredQuestion = components["schemas"]["AnsweredQuestion"];
export type FeedbackRequest = components["schemas"]["FeedbackRequest"];
export type FeedbackResponse = components["schemas"]["FeedbackResponse"];
export type CandidateProfile = components["schemas"]["CandidateProfile"];
export type Preset = components["schemas"]["Preset"];
export type GuardVerdict = components["schemas"]["GuardVerdict"];
export type SystemPromptRequest = components["schemas"]["SystemPromptRequest"];
export type SystemPromptResponse = components["schemas"]["SystemPromptResponse"];
export type TranscriptResponse = components["schemas"]["TranscriptResponse"];
export type SpeakRequest = components["schemas"]["SpeakRequest"];

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// same as MAX_MESSAGE_CHARS in backend.
// backend enforces it, but keep the text field limited
export const MAX_MESSAGE_CHARS = 4000;
// same as MAX_JD_CHARS in the backend (plan request)
export const MAX_JD_CHARS = 8000;
// same as MAX_CV_BYTES in the backend: checked here too, so a big file isn't sent at all
export const MAX_CV_BYTES = 5 * 1024 * 1024;

export class ApiError extends Error {
  status: number;
  retryAfter?: number; // seconds, set on 429

  constructor(status: number, message: string, retryAfter?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function errorMessage(
  error: unknown,
  offline = "Connection lost. Please try again.",
): string {
  if (!(error instanceof ApiError)) {
    return offline; // fetch failed: backend down or no network
  }
  // 429: the backend says how long to wait in Retry-After
  if (error.retryAfter) {
    return `${error.message} (about ${error.retryAfter}s)`;
  }
  return error.message;
}

async function toApiError(response: Response): Promise<ApiError> {
  let message = `Request failed (${response.status})`;
  try {
    // HTTPException -> {detail: "..."}; validation error (422) -> {detail: [{msg, ...}]}
    const body = await response.json();

    if (typeof body.detail === "string") {
      message = body.detail;
    } else if (Array.isArray(body.detail) && body.detail[0]?.msg) {
      message = body.detail[0].msg;
    }
  } catch {
    // no JSON body, keep the generic message
  }
  const retryAfter = Number(response.headers.get("Retry-After")) || undefined;
  return new ApiError(response.status, message, retryAfter);
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${API_URL}${path}`, init);

  if (!response.ok) {
    throw await toApiError(response);
  }

  return response;
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await send(path, init);
  return response.json() as Promise<T>;
}

// a reply + its LLM cost in USD
export type Priced<T> = { value: T; cost: number | null };

// for CV, plan and feedback
function costOf(response: Response): number | null {
  const cost = response.headers.get("X-Cost");
  return cost === null ? null : Number(cost);
}

async function requestPriced<T>(path: string, init?: RequestInit): Promise<Priced<T>> {
  const response = await send(path, init);
  return { value: (await response.json()) as T, cost: costOf(response) };
}

function jsonPost(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, jsonPost(body));
}

export function getConfig(): Promise<AppConfig> {
  return request<AppConfig>("/api/config");
}

// ready-made candidates (settings + profile + sample JD), static data
export function getPresets(): Promise<Preset[]> {
  return request<Preset[]>("/api/presets");
}

// PDF → guarded → CandidateProfile (~7 s: Jev + one LLM call). The CV itself isn't kept
export function parseCv(file: File): Promise<Priced<CandidateProfile>> {
  const body = new FormData();
  body.append("file", file);
  // no Content-Type header: the browser sets multipart/form-data with its boundary
  return requestPriced<CandidateProfile>("/api/cv/parse", { method: "POST", body });
}

// the question list for one interview (~6 s: guard + one LLM call).
// Send it back unchanged with every chat turn: it's signed
export function createPlan(body: PlanRequest): Promise<Priced<SignedPlan>> {
  return requestPriced<SignedPlan>("/api/interview/plan", jsonPost(body));
}

// scores (Jev) + written feedback (LLM) for the answered questions, ~10-20 s
export function createFeedback(body: FeedbackRequest): Promise<Priced<FeedbackResponse>> {
  return requestPriced<FeedbackResponse>("/api/interview/feedback", jsonPost(body));
}

// the interviewer's system prompt as the chat builds it, canary masked. No LLM call,
// but it counts toward the chat's rate limit
export function getSystemPrompt(body: SystemPromptRequest): Promise<SystemPromptResponse> {
  return post<SystemPromptResponse>("/api/interview/system-prompt", body);
}

// 16 kHz mono 16-bit PCM → text, on our backend (Parakeet, local: the voice never leaves
// the machine). "" = nothing said. ~0.3 s for 15 s of speech
export async function transcribe(
  pcm: Int16Array<ArrayBuffer>,
  signal?: AbortSignal,
): Promise<string> {
  const { text } = await request<TranscriptResponse>("/api/voice/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    // the array itself, not pcm.buffer: for a slice (subarray) that's the whole recording
    body: pcm,
    signal,
  });
  return text;
}

// one sentence in Gemini's voice (the TTS switch "on"): raw PCM, 24 kHz mono 16-bit.
// 1.4-3.8 s per sentence; the cost counts toward the session's cost cap
export async function speak(
  body: SpeakRequest,
  signal?: AbortSignal,
): Promise<Priced<ArrayBuffer>> {
  const response = await send("/api/voice/speak", { ...jsonPost(body), signal });
  return { value: await response.arrayBuffer(), cost: costOf(response) };
}

// one whole interviewer turn as JSON (not streamed!)
export function chat(body: ChatRequest): Promise<ChatResponse> {
  return post<ChatResponse>("/api/interview/chat", body);
}

// stream events
export type ChatStreamEvent =
  | { event: "meta"; data: Pick<ChatResponse, "hint" | "ended" | "progress" | "guard"> }
  | { event: "token"; data: { text: string } }
  | { event: "usage"; data: { input_tokens: number; output_tokens: number; cost: number | null } }
  | {
      event: "blocked";
      data: { reason: NonNullable<ChatResponse["blocked"]>; reply: string; guard?: GuardVerdict };
    }
  | { event: "done"; data: { finish_reason: string | null } };

// one interviewer turn, streamed - yields each event as it arrives.
export async function* streamChat(
  body: ChatRequest,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const response = await fetch(`${API_URL}/api/interview/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  // 422 / 429 come back as JSON before the stream starts
  if (!response.ok || !response.body) {
    throw await toApiError(response);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    // an event is a block of lines ending in a blank line; a network chunk can hold
    // several events or half of one, so only complete blocks are parsed
    let end;

    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = parseEvent(block);

      if (event) {
        yield event;
      }
    }
  }
}

function parseEvent(block: string): ChatStreamEvent | null {
  let event = "";
  let data = "";

  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data += line.slice(5).trim();
    }
  }

  if (!event || !data) {
    return null;
  }
  return { event, data: JSON.parse(data) } as ChatStreamEvent;
}
