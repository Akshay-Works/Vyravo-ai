import { NextRequest } from "next/server";
import { db } from "@/db";
import { leads, activities } from "@/db/schema";
import { eq, ilike, and, isNull } from "drizzle-orm";
import { contactPriorityOf, ensureContactPriorityColumn } from "@/lib/leads/quality";
import { normalizeCity } from "@/lib/leads/city";

// only genuine LinkedIn profile/company URLs are accepted on ingest
const LI_RE = /^(https?:\/\/)?(([\w-]+\.)?linkedin\.com)\/(in|company|pub)\/[A-Za-z0-9\-_%]+/i;

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
  const linkedinUrl = typeof body.linkedinUrl === "string" && LI_RE.test(body.linkedinUrl.trim())
    ? body.linkedinUrl.trim()
    : null;
  const city = normalizeCity(body.city);

  // ---- LEAD DATA QUALITY RULE: email OR phone is MANDATORY ----
  const contactPriority = contactPriorityOf({
    email: body.email, phone: body.phone, website: body.businessWebsite, linkedin: linkedinUrl,
  });
  if (contactPriority === 0) {
    return Response.json(
      { success: false, rejected: true, reason: "no valid email AND no valid phone — mandatory contact rule (website/LinkedIn are enrichment, not qualification)" },
      { status: 400 }
    );
  }
  await ensureContactPriorityColumn();

  // back-fill: if the lead already exists but lacks LinkedIn URL / city, store
  // them now (past pushes gain outreach recipients + city-wise grouping too)
  const maybeUpdate = async (leadId: number) => {
    if (linkedinUrl) {
      await db.update(leads).set({ linkedinUrl: linkedinUrl, updatedAt: new Date() }).where(
        and(eq(leads.id, leadId), isNull(leads.linkedinUrl))
      );
    }
    if (city) {
      await db.update(leads).set({ city: city, updatedAt: new Date() }).where(
        and(eq(leads.id, leadId), isNull(leads.city))
      );
    }
    return leadId;
  };

  if (body.email) {
    const dup = await db.select({ id: leads.id }).from(leads)
      .where(ilike(leads.email, String(body.email).toLowerCase())).limit(1);
    if (dup.length) { await maybeUpdate(dup[0].id); return Response.json({ success: true, lead: dup[0], created: false }); }
  }
  if (body.phone) {
    const conds = [eq(leads.phone, String(body.phone))];
    if (body.businessName) conds.push(ilike(leads.businessName, String(body.businessName)));
    const dup = await db.select({ id: leads.id }).from(leads).where(and(...conds)).limit(1);
    if (dup.length) { await maybeUpdate(dup[0].id); return Response.json({ success: true, lead: dup[0], created: false }); }
  }
  if (body.businessWebsite) {
    const dup = await db.select({ id: leads.id }).from(leads)
      .where(eq(leads.businessWebsite, String(body.businessWebsite))).limit(1);
    if (dup.length) { await maybeUpdate(dup[0].id); return Response.json({ success: true, lead: dup[0], created: false }); }
  }

  const [newLead] = await db.insert(leads).values({
    fullName: body.fullName,
    email: body.email || null,
    phone: body.phone || null,
    businessName: body.businessName || null,
    businessWebsite: body.businessWebsite || null,
    linkedinUrl: linkedinUrl,
    industry: body.industry || null,
    country: body.country || "India",
    city: city,
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
    contactPriority: contactPriority,
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
