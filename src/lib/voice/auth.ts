// Voice Receptionist — lightweight admin-key protection.
//
// The main Vyravo AI site has no user-account system, so the voice endpoints
// are protected with an optional shared key (ADMIN_API_KEY env var, never
// exposed to the browser):
//   - ADMIN_API_KEY not set → demo mode: endpoints are open (the whole site is
//     a public demo; only simulated data is created).
//   - ADMIN_API_KEY set     → all /api/voice/* endpoints require the
//     `x-admin-key` header. Call history, statistics and configuration are
//     protected from public access.
//
// When real multi-tenant authentication lands, this helper is the single
// place to swap in the existing auth system.

export function adminKeyConfigured(): boolean {
  return Boolean(process.env.ADMIN_API_KEY?.trim());
}

/** Constant-time-ish comparison to avoid trivial timing leaks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isAuthorized(request: Request): boolean {
  if (!adminKeyConfigured()) return true;
  const supplied = (request.headers.get("x-admin-key") || "").trim();
  if (!supplied) return false;
  return safeEqual(supplied, process.env.ADMIN_API_KEY!.trim());
}

export function unauthorizedResponse(): Response {
  return Response.json(
    { error: "Unauthorized. Provide a valid admin key (x-admin-key header)." },
    { status: 401 }
  );
}
