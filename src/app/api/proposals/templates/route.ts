import { NextRequest } from "next/server";
import { eq, asc } from "drizzle-orm";
import { db } from "@/db";
import { proposalTemplates } from "@/db/proposal-schema";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/knowledge-base/rate-limit";
import { ensureProposalTables } from "@/lib/proposals/engine";

export const dynamic = "force-dynamic";

// GET /api/proposals/templates
export async function GET() {
  try {
    await ensureProposalTables();
    const templates = await db
      .select()
      .from(proposalTemplates)
      .where(eq(proposalTemplates.isActive, true))
      .orderBy(asc(proposalTemplates.name));
    return Response.json({ templates });
  } catch (e) {
    console.error("List templates error:", e);
    return Response.json({ error: "Failed to load templates" }, { status: 500 });
  }
}

// POST /api/proposals/templates — create custom template
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  { const rl = rateLimit("write", clientIp(request)); if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec); }

  try {
    const body = await request.json();
    if (!body.name?.trim()) return Response.json({ error: "Name is required" }, { status: 400 });
    const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const inserted = await db
      .insert(proposalTemplates)
      .values({
        name: body.name.trim(),
        slug,
        description: body.description || null,
        category: body.category || "custom",
        content: body.content || { sections: [] },
        isDefault: false,
        isActive: true,
      })
      .returning({ id: proposalTemplates.id });
    return Response.json({ success: true, id: inserted[0].id }, { status: 201 });
  } catch (e) {
    console.error("Create template error:", e);
    return Response.json({ error: "Failed to create template" }, { status: 500 });
  }
}
