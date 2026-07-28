import { db } from "@/db";
import { leads, activities } from "@/db/schema";
import { desc, eq, ilike, or, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

// GET - List all leads with filtering
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const stage = searchParams.get("stage") || "";
    const category = searchParams.get("category") || "";
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Build where conditions
    const conditions = [];

    if (search) {
      conditions.push(
        or(
          ilike(leads.fullName, `%${search}%`),
          ilike(leads.email, `%${search}%`),
          ilike(leads.businessName, `%${search}%`)
        )
      );
    }

    if (stage) {
      conditions.push(eq(leads.stage, stage));
    }

    if (category) {
      conditions.push(eq(leads.leadCategory, category));
    }

    const whereClause = conditions.length > 0 
      ? and(...conditions)
      : undefined;

    const result = await db
      .select()
      .from(leads)
      .where(whereClause)
      .orderBy(desc(leads.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(leads)
      .where(whereClause);

    return Response.json({
      success: true,
      leads: result,
      total: Number(countResult[0]?.count || 0),
      limit,
      offset,
    });
  } catch (error) {
    console.error("Leads API error:", error);
    return Response.json(
      { success: false, error: "Failed to fetch leads" },
      { status: 500 }
    );
  }
}

// POST - Create new lead
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const [newLead] = await db.insert(leads).values({
      fullName: body.fullName,
      email: body.email,
      phone: body.phone || null,
      businessName: body.businessName || null,
      businessWebsite: body.businessWebsite || null,
      industry: body.industry || null,
      companySize: body.companySize || null,
      country: body.country || null,
      biggestChallenge: body.biggestChallenge || null,
      automationGoals: body.automationGoals || null,
      budgetRange: body.budgetRange || null,
      timeline: body.timeline || null,
      leadScore: body.leadScore || 0,
      leadCategory: body.leadCategory || null,
      stage: body.stage || "new",
      status: "active",
      priority: body.priority || "medium",
      source: body.source || "manual",
      tags: body.tags || [],
    }).returning();

    // Log activity
    await db.insert(activities).values({
      type: "lead",
      action: "created",
      description: `New lead created: ${body.fullName}`,
      leadId: newLead.id,
    });

    return Response.json({
      success: true,
      lead: newLead,
    });
  } catch (error) {
    console.error("Create lead error:", error);
    return Response.json(
      { success: false, error: "Failed to create lead" },
      { status: 500 }
    );
  }
}
