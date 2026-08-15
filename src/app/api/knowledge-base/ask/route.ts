import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/knowledge-base/rate-limit";
import { askKnowledge } from "@/lib/knowledge-base/engine";
import type { AccessLevel } from "@/lib/knowledge-base/types";

export const dynamic = "force-dynamic";

// POST /api/knowledge-base/ask
// Body: { question, categoryId?, accessLevels?, sessionId? }
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
  { const rl = rateLimit("ask", clientIp(request)); if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec); }
    const body = await request.json();
    const question = body.question?.toString().trim();
    if (!question) {
      return Response.json({ error: "Question is required" }, { status: 400 });
    }

    const accessLevels: AccessLevel[] =
      Array.isArray(body.accessLevels) && body.accessLevels.length
        ? body.accessLevels
        : ["public", "internal", "confidential"];

    const result = await askKnowledge(question, {
      accessLevels,
      categoryId: body.categoryId ? Number(body.categoryId) : undefined,
      sessionId: body.sessionId,
    });

    return Response.json(result);
  } catch (error) {
    console.error("Ask KB error:", error);
    return Response.json({ error: "Failed to answer question" }, { status: 500 });
  }
}
