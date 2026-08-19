// Shared, SERVER-ONLY OpenAI client for Vyravo AI.
//
// SECURITY CONTRACT
// -----------------
// 1. `OPENAI_API_KEY` is read from the server environment only. It is never
//    imported into a client component, never sent to the browser, and never
//    included in an API response.
// 2. Nothing in this module returns raw provider errors to callers that render
//    to the browser — use `classifyOpenAIError()` and surface
//    `USER_FACING_AI_ERROR` instead.
// 3. Every log line goes through `redactSecrets()` so an accidentally
//    interpolated key can never reach the logs.
//
// The key is configured in Vercel → Project Settings → Environment Variables.

import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  PermissionDeniedError,
  RateLimitError,
} from "openai";

/** Message shown to visitors whenever the AI path fails for any reason. */
export const USER_FACING_AI_ERROR =
  "Sorry, I'm having trouble processing that right now. Please try again or book a discovery call.";

/** Default model: cheap + fast, appropriate for website chat. Override with OPENAI_CHAT_MODEL. */
const DEFAULT_CHAT_MODEL = "gpt-4o-mini";

/** Hard ceiling on a single OpenAI request so a hung call can't hold a serverless function open. */
const REQUEST_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS) || 20_000;

/** Retries handled by the SDK (429 / 5xx / connection errors) with exponential backoff. */
const MAX_RETRIES = Number(process.env.OPENAI_MAX_RETRIES) || 1;

export class OpenAINotConfiguredError extends Error {
  constructor() {
    super("OPENAI_API_KEY is not configured on the server");
    this.name = "OpenAINotConfiguredError";
  }
}

/** Guard: this module must never be bundled into client-side code. */
function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "The OpenAI client is server-only and must not be imported from a client component."
    );
  }
}

function readApiKey(): string | undefined {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key ? key : undefined;
}

/** True when the server has an OpenAI key. Safe to call from a route handler. */
export function isOpenAIConfigured(): boolean {
  return Boolean(readApiKey());
}

/** The chat model to use. Falls back to the legacy CHATBOT_LLM_MODEL var used by the KB. */
export function getChatModel(): string {
  return (
    process.env.OPENAI_CHAT_MODEL?.trim() ||
    process.env.CHATBOT_LLM_MODEL?.trim() ||
    DEFAULT_CHAT_MODEL
  );
}

/**
 * Reasoning-family models reject `temperature`. Detect them so a model swap via
 * env var can't start returning 400s.
 */
export function modelSupportsTemperature(model: string): boolean {
  return !/^(o\d|gpt-5)/i.test(model);
}

let cachedClient: OpenAI | null = null;
let cachedKey: string | null = null;

/**
 * Lazily-created singleton OpenAI client.
 * @throws {OpenAINotConfiguredError} when `OPENAI_API_KEY` is missing.
 */
export function getOpenAIClient(): OpenAI {
  assertServerOnly();

  const apiKey = readApiKey();
  if (!apiKey) throw new OpenAINotConfiguredError();

  // Recreate if the key rotated between invocations (Vercel warm containers).
  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new OpenAI({
      apiKey,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    });
    cachedKey = apiKey;
  }

  return cachedClient;
}

export type OpenAIFailureKind =
  | "not_configured"
  | "auth"
  | "rate_limit"
  | "timeout"
  | "network"
  | "bad_request"
  | "server"
  | "aborted"
  | "unknown";

export interface ClassifiedOpenAIError {
  kind: OpenAIFailureKind;
  /** HTTP status, when the failure came back from the API. */
  status?: number;
  /** Safe, already-redacted description for server logs. NEVER send to a browser. */
  logMessage: string;
  /** Whether retrying the same request later could plausibly succeed. */
  retryable: boolean;
}

/**
 * Strip anything that looks like an API key/bearer token out of a string before
 * it reaches a log sink.
 */
export function redactSecrets(input: string): string {
  return input
    .replace(/sk-[A-Za-z0-9_\-]{8,}/g, "sk-***REDACTED***")
    .replace(/Bearer\s+[A-Za-z0-9._\-]{8,}/gi, "Bearer ***REDACTED***");
}

/** Turn any thrown value into a safe, structured description. */
export function classifyOpenAIError(error: unknown): ClassifiedOpenAIError {
  if (error instanceof OpenAINotConfiguredError) {
    return {
      kind: "not_configured",
      logMessage: "OPENAI_API_KEY is not configured on the server",
      retryable: false,
    };
  }
  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
    return {
      kind: "auth",
      status: error.status,
      logMessage: `OpenAI rejected the credentials (status ${error.status}). Check OPENAI_API_KEY.`,
      retryable: false,
    };
  }
  if (error instanceof RateLimitError) {
    return {
      kind: "rate_limit",
      status: error.status,
      logMessage: "OpenAI rate limit / quota exceeded (status 429)",
      retryable: true,
    };
  }
  if (error instanceof APIConnectionTimeoutError) {
    return { kind: "timeout", logMessage: "OpenAI request timed out", retryable: true };
  }
  if (error instanceof APIUserAbortError) {
    return { kind: "aborted", logMessage: "OpenAI request aborted", retryable: false };
  }
  if (error instanceof APIConnectionError) {
    return { kind: "network", logMessage: "Network error reaching OpenAI", retryable: true };
  }
  if (error instanceof BadRequestError) {
    return {
      kind: "bad_request",
      status: error.status,
      logMessage: redactSecrets(`OpenAI rejected the request (400): ${error.message}`),
      retryable: false,
    };
  }
  if (error instanceof APIError) {
    const status = error.status ?? 0;
    return {
      kind: status >= 500 ? "server" : "unknown",
      status: error.status,
      logMessage: redactSecrets(`OpenAI API error (status ${status}): ${error.message}`),
      retryable: status >= 500,
    };
  }
  return {
    kind: "unknown",
    logMessage: redactSecrets(
      error instanceof Error ? `Unexpected OpenAI failure: ${error.message}` : "Unexpected OpenAI failure"
    ),
    retryable: false,
  };
}

/** Log an OpenAI failure safely (no keys, no request bodies). */
export function logOpenAIError(scope: string, error: unknown): ClassifiedOpenAIError {
  const classified = classifyOpenAIError(error);
  console.error(`[openai:${scope}] ${classified.kind} — ${classified.logMessage}`);
  return classified;
}

/**
 * Non-secret status for health/diagnostic endpoints.
 * Reports only whether a key exists — never any part of the key itself.
 */
export function getOpenAIStatus(): { configured: boolean; model: string } {
  return { configured: isOpenAIConfigured(), model: getChatModel() };
}
