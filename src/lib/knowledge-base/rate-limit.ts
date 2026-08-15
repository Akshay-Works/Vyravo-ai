// Lightweight in-memory rate limiting for Knowledge Base APIs.
//
// Sliding-window counter keyed by IP (per server instance — fine for the
// current single-instance deployment; swap for Redis on multi-instance).
// Never throws: on failure it allows the request through (fail-open).

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

const WINDOW_MS = 60_000;

// route → { limit per window, label }
const LIMITS: Record<string, { limit: number }> = {
  ask: { limit: 20 },      // 20 AI questions / min / IP
  search: { limit: 60 },   // 60 searches / min / IP
  upload: { limit: 10 },   // 10 uploads / min / IP
  write: { limit: 30 },    // 30 writes (create/update/delete) / min / IP
  default: { limit: 120 },
};

const hits = new Map<string, number[]>();

export function rateLimit(
  route: string,
  ip: string
): RateLimitResult {
  try {
    const key = `${route}:${ip || "unknown"}`;
    const now = Date.now();
    const windowStart = now - WINDOW_MS;

    const recent = (hits.get(key) || []).filter((t) => t > windowStart);
    const limit = (LIMITS[route] || LIMITS.default).limit;

    if (recent.length >= limit) {
      const oldest = recent[0];
      const retryAfterSec = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
      return { allowed: false, remaining: 0, retryAfterSec };
    }

    recent.push(now);
    hits.set(key, recent);
    return { allowed: true, remaining: limit - recent.length, retryAfterSec: 0 };
  } catch {
    return { allowed: true, remaining: 999, retryAfterSec: 0 }; // fail-open
  }
}

/** Extract a client IP from a Next.js Request (best-effort). */
export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function rateLimitResponse(retryAfterSec: number): Response {
  return Response.json(
    {
      error: "Too many requests. Please wait a moment and try again.",
      retryAfterSec,
    },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}
