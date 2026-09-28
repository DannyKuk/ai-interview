import type { components } from "@/lib/api-types";

export type AppConfig = components["schemas"]["AppConfig"];

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

async function toApiError(response: Response): Promise<ApiError> {
  let message = `Request failed (${response.status})`;
  try {
    // HTTPException -> {detail: "..."}; validation error (422) -> {detail: [{msg, ...}]}
    const body = await response.json();
    if (typeof body.detail === "string") message = body.detail;
    else if (Array.isArray(body.detail) && body.detail[0]?.msg) message = body.detail[0].msg;
  } catch {
    // no JSON body, keep the generic message
  }
  const retryAfter = Number(response.headers.get("Retry-After")) || undefined;
  return new ApiError(response.status, message, retryAfter);
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  if (!response.ok) throw await toApiError(response);
  return response.json() as Promise<T>;
}

export function getConfig(): Promise<AppConfig> {
  return request<AppConfig>("/api/config");
}
