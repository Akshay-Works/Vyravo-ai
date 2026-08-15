// GET /api/voice/calls — call history (protected when ADMIN_API_KEY is set).

import { withStore } from "@/lib/voice/storage";
import { isAuthorized, unauthorizedResponse } from "@/lib/voice/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorizedResponse();

  const calls = await withStore((s) => s.listCalls(100));
  return Response.json({ calls });
}
