import type { components } from "@/lib/api-types";

export type AppConfig = components["schemas"]["AppConfig"];
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

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// same as MAX_MESSAGE_CHARS in backend.
// backend enforces it, but keep the text field limited
export const MAX_MESSAGE_CHARS = 4000;

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

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);

  if (!response.ok) {
    throw await toApiError(response);
  }

  return response.json() as Promise<T>;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function getConfig(): Promise<AppConfig> {
  return request<AppConfig>("/api/config");
}

// the question list for one interview (~6 s: guard + one LLM call).
// Send it back unchanged with every chat turn: it's signed
export function createPlan(body: PlanRequest): Promise<SignedPlan> {
  return post<SignedPlan>("/api/interview/plan", body);
}

// one whole interviewer turn as JSON (not streamed!)
export function chat(body: ChatRequest): Promise<ChatResponse> {
  return post<ChatResponse>("/api/interview/chat", body);
}

// stream events
export type ChatStreamEvent =
  | { event: "meta"; data: Pick<ChatResponse, "hint" | "ended" | "progress"> }
  | { event: "token"; data: { text: string } }
  | { event: "usage"; data: { input_tokens: number; output_tokens: number; cost: number | null } }
  | { event: "blocked"; data: { reason: NonNullable<ChatResponse["blocked"]>; reply: string } }
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
