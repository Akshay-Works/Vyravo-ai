import { NextRequest } from "next/server";
import { db } from "@/db";
import { leads, activities } from "@/db/schema";
import { eq, ilike, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

// POST /api/engine/leads — ingest from the Vyravo Lead Engine (real data).
// Auth: x-engine-key == ENGINE_INGEST_KEY (Vercel env). Idempotent.
export async function POST(request: NextRequest) {
  const key = (process.env.ENGINE_INGEST_KEY || "").trim();
  if (!key || request.headers.get("x-engine-key") !== key) {
    return Response.json({ success: false, error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  if (!body.fullName) return Response.json({ success: false, error: "fullName required" }, { status: 400 });

  if (body.email) {
    const dup = await db.select({ id: leads.id }).from(leads)
      .where(ilike(leads.email, String(body.email).toLowerCase())).limit(1);
    if (dup.length) return Response.json({ success: true, lead: dup[0], created: false });
  }
  if (body.phone) {
    const conds = [eq(leads.phone, String(body.phone))];
    if (body.businessName) conds.push(ilike(leads.businessName, String(body.businessName)));
    const dup = await db.select({ id: leads.id }).from(leads).where(and(...conds)).limit(1);
    if (dup.length) return Response.json({ success: true, lead: dup[0], created: false });
  }
  if (body.businessWebsite) {
    const dup = await db.select({ id: leads.id }).from(leads)
      .where(eq(leads.businessWebsite, String(body.businessWebsite))).limit(1);
    if (dup.length) return Response.json({ success: true, lead: dup[0], created: false });
  }

  const [newLead] = await db.insert(leads).values({
    fullName: body.fullName,
    email: body.email || null,
    phone: body.phone || null,
    businessName: body.businessName || null,
    businessWebsite: body.businessWebsite || null,
    industry: body.industry || null,
    country: body.country || "India",
    biggestChallenge: body.biggestChallenge || null,
    additionalInfo: body.additionalInfo || null,
    qualificationSummary: body.qualificationSummary || null,
    leadType: body.leadType || null,
    leadScore: body.leadScore || 0,
    leadCategory: body.leadCategory || null,
    stage: body.stage || "new",
    status: "active",
    priority: body.priority || "medium",
    source: body.source || "lead_engine",
    tags: body.tags || [],
  }).returning();

  await db.insert(activities).values({
    type: "lead",
    action: "created",
    description: `Engine lead: ${body.fullName}`,
    leadId: newLead.id,
    metadata: { source: "lead_engine", score: body.leadScore || null },
  } as any);

  return Response.json({ success: true, lead: { id: newLead.id }, created: true });
}
