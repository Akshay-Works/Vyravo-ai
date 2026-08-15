import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/knowledge-base/rate-limit";
import { searchKnowledge, logQuery } from "@/lib/knowledge-base/engine";
import type { AccessLevel } from "@/lib/knowledge-base/types";

export const dynamic = "force-dynamic";

// GET /api/knowledge-base/search?q=&categoryId=&access=&topK=&threshold=
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
  { const rl = rateLimit("search", clientIp(request)); if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec); }
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    const categoryId = searchParams.get("categoryId")
      ? Number(searchParams.get("categoryId"))
      : undefined;
    const accessParam = searchParams.get("access");
    const accessLevels: AccessLevel[] = accessParam
      ? (accessParam.split(",") as AccessLevel[])
      : ["public", "internal", "confidential", "client-specific", "restricted"];
    const topK = Math.min(Number(searchParams.get("topK") || "10"), 30);
    const threshold = Number(searchParams.get("threshold") || "0.1");

    if (!q.trim()) {
      return Response.json({ results: [] });
    }

    const results = await searchKnowledge({
      query: q,
      categoryId,
      accessLevel: accessLevels,
      topK,
      similarityThreshold: threshold,
    });

    await logQuery(q, "search", results.length, results[0]?.score ?? 0, results.length > 0);

    return Response.json({ results });
  } catch (error) {
    console.error("Search error:", error);
    return Response.json({ error: "Search failed" }, { status: 500 });
  }
}
