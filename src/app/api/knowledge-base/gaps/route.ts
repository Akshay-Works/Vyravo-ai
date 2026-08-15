import { NextRequest } from "next/server";
import { desc, eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { kbKnowledgeGaps } from "@/db/knowledge-schema";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/knowledge-base/rate-limit";

export const dynamic = "force-dynamic";

// GET /api/knowledge-base/gaps?status=open&limit=&offset=
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const limit = Math.min(Number(searchParams.get("limit") || "50"), 200);
    const offset = Number(searchParams.get("offset") || "0");

    const where = status ? eq(kbKnowledgeGaps.status, status) : undefined;

    const [gaps, total] = await Promise.all([
      db
        .select()
        .from(kbKnowledgeGaps)
        .where(where)
        .orderBy(desc(kbKnowledgeGaps.frequency))
        .limit(limit)
        .offset(offset),
      db
        .select({ n: sql`count(*)::int` })
        .from(kbKnowledgeGaps)
        .where(where)
        .then((r) => Number(r[0]?.n ?? 0)),
    ]);

    return Response.json({ gaps, total });
  } catch (error) {
    console.error("List gaps error:", error);
    return Response.json({ error: "Failed to load gaps" }, { status: 500 });
  }
}

// PATCH /api/knowledge-base/gaps/[id] — update status/suggested action
// POST /api/knowledge-base/gaps — record a gap manually
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  { const rl = rateLimit("write", clientIp(request)); if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec); }

  try {
    const body = await request.json();
    const { question, category, suggestedAction } = body;
    if (!question || typeof question !== "string") {
      return Response.json({ error: "Question is required" }, { status: 400 });
    }

    const inserted = await db
      .insert(kbKnowledgeGaps)
      .values({
        question: question.trim(),
        category: category || "uncategorized",
        status: "open",
        suggestedAction: suggestedAction || "Review and add knowledge for this question.",
      })
      .returning({ id: kbKnowledgeGaps.id });

    return Response.json({ success: true, id: inserted[0].id }, { status: 201 });
  } catch (error) {
    console.error("Create gap error:", error);
    return Response.json({ error: "Failed to create gap" }, { status: 500 });
  }
}

// PATCH with id in body — update gap
export async function PATCH(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  { const rl = rateLimit("write", clientIp(request)); if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec); }
  try {
    const body = await request.json();
    const { id, status, suggestedAction, resolvedByDocumentId } = body;
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (status) patch.status = status;
    if (suggestedAction !== undefined) patch.suggestedAction = suggestedAction;
    if (resolvedByDocumentId !== undefined) patch.resolvedByDocumentId = resolvedByDocumentId;
    if (status === "resolved") patch.resolvedAt = new Date();

    await db.update(kbKnowledgeGaps).set(patch).where(eq(kbKnowledgeGaps.id, id));
    return Response.json({ success: true });
  } catch (error) {
    console.error("Update gap error:", error);
    return Response.json({ error: "Failed to update gap" }, { status: 500 });
  }
}
