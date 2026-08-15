import { NextRequest } from "next/server";
import { eq, asc } from "drizzle-orm";
import { db } from "@/db";
import { kbCategories } from "@/db/knowledge-schema";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/knowledge-base/rate-limit";
import { ensureDefaultCategories, logAudit } from "@/lib/knowledge-base/engine";

export const dynamic = "force-dynamic";

// GET /api/knowledge-base/categories
export async function GET() {
  // Public-safe: categories names only, but this is an admin endpoint
  try {
    await ensureDefaultCategories();
    const categories = await db
      .select()
      .from(kbCategories)
      .orderBy(asc(kbCategories.sortOrder));
    return Response.json({ categories });
  } catch (error) {
    console.error("List categories error:", error);
    return Response.json({ error: "Failed to load categories" }, { status: 500 });
  }
}

// POST /api/knowledge-base/categories — create a custom category
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  { const rl = rateLimit("write", clientIp(request)); if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec); }

  try {
    const body = await request.json();
    const { name, description, icon, color, parentId } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return Response.json({ error: "Name is required" }, { status: 400 });
    }

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const existing = await db
      .select({ id: kbCategories.id })
      .from(kbCategories)
      .where(eq(kbCategories.slug, slug))
      .limit(1);

    if (existing.length > 0) {
      return Response.json({ error: "Category with this name already exists" }, { status: 409 });
    }

    const inserted = await db
      .insert(kbCategories)
      .values({
        name: name.trim(),
        slug,
        description: description || "",
        icon: icon || "📁",
        color: color || "#64748B",
        parentId: parentId || null,
      })
      .returning({ id: kbCategories.id });

    await logAudit("create", "category", inserted[0].id, { name });

    return Response.json({ success: true, id: inserted[0].id }, { status: 201 });
  } catch (error) {
    console.error("Create category error:", error);
    return Response.json({ error: "Failed to create category" }, { status: 500 });
  }
}
