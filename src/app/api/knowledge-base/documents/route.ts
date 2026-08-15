import { NextRequest } from "next/server";
import { desc, eq, and, or, ilike, sql } from "drizzle-orm";
import { db } from "@/db";
import { kbDocuments, kbCategories } from "@/db/knowledge-schema";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/knowledge-base/rate-limit";
import { createDocument } from "@/lib/knowledge-base/engine";

export const dynamic = "force-dynamic";

// GET /api/knowledge-base/documents?search=&status=&category=&type=&access=&limit=&offset=
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status");
    const categoryId = searchParams.get("category");
    const type = searchParams.get("type");
    const accessLevel = searchParams.get("access");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const offset = parseInt(searchParams.get("offset") || "0");

    const filters: any[] = [];
    if (search) {
      filters.push(
        or(
          ilike(kbDocuments.title, `%${search}%`),
          ilike(kbDocuments.summary, `%${search}%`)
        )
      );
    }
    if (status) filters.push(eq(kbDocuments.status, status as any));
    if (categoryId) filters.push(eq(kbDocuments.categoryId, Number(categoryId)));
    if (type) filters.push(eq(kbDocuments.docType, type as any));
    if (accessLevel) filters.push(eq(kbDocuments.accessLevel, accessLevel as any));

    const where = filters.length ? and(...filters) : undefined;

    const [rows, total] = await Promise.all([
      db
        .select({
          id: kbDocuments.id,
          title: kbDocuments.title,
          docType: kbDocuments.docType,
          status: kbDocuments.status,
          accessLevel: kbDocuments.accessLevel,
          categoryId: kbDocuments.categoryId,
          tags: kbDocuments.tags,
          version: kbDocuments.version,
          sourceType: kbDocuments.sourceType,
          mimeType: kbDocuments.mimeType,
          fileName: kbDocuments.fileName,
          fileSize: kbDocuments.fileSize,
          processingStatus: kbDocuments.processingStatus,
          processingError: kbDocuments.processingError,
          processingStage: kbDocuments.processingStage,
          sourceUri: kbDocuments.sourceUri,
          enrichmentStatus: kbDocuments.enrichmentStatus,
          enrichmentApproved: kbDocuments.enrichmentApproved,
          chunkCount: kbDocuments.chunkCount,
          isArchived: kbDocuments.isArchived,
          createdAt: kbDocuments.createdAt,
          updatedAt: kbDocuments.updatedAt,
          publishedAt: kbDocuments.publishedAt,
          summary: kbDocuments.summary,
        })
        .from(kbDocuments)
        .where(where)
        .orderBy(desc(kbDocuments.updatedAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ n: sql`count(*)::int` })
        .from(kbDocuments)
        .where(where)
        .then((r) => Number(r[0]?.n ?? 0)),
    ]);

    const cats = await db.select({ id: kbCategories.id, name: kbCategories.name }).from(kbCategories);
    const catMap = new Map(cats.map((c) => [c.id, c.name]));

    return Response.json({
      documents: rows.map((r) => ({
        id: r.id,
        title: r.title,
        type: r.docType || "document",
        status: r.status,
        accessLevel: r.accessLevel,
        categoryId: r.categoryId,
        categoryName: r.categoryId ? catMap.get(r.categoryId) || null : null,
        tags: r.tags,
        version: r.version,
        fileType: r.mimeType || r.sourceType,
        fileSize: r.fileSize,
        originalFileName: r.fileName,
        processingStatus: r.processingStatus,
        processingError: r.processingError,
        sourceUrl: r.sourceUri,
        aiGenerated: r.enrichmentStatus === "approved" && r.enrichmentApproved === false ? true : r.enrichmentStatus === "pending" || r.enrichmentStatus === "suggested",
        chunkCount: r.chunkCount,
        isArchived: r.isArchived,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        publishedAt: r.publishedAt,
        excerpt: r.summary,
      })),
      total,
    });
  } catch (error) {
    console.error("List documents error:", error);
    return Response.json({ error: "Failed to list documents" }, { status: 500 });
  }
}

// POST /api/knowledge-base/documents — create a manual document/article
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  { const rl = rateLimit("write", clientIp(request)); if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec); }

  try {
    const body = await request.json();
    const {
      title,
      content,
      type = "document",
      categoryId,
      tags,
      status = "draft",
      accessLevel = "internal",
      sourceUrl,
      aiGenerated = false,
    } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return Response.json({ error: "Title is required" }, { status: 400 });
    }

    const id = await createDocument({
      title: title.trim(),
      content: content || "",
      type,
      categoryId: categoryId || undefined,
      tags: Array.isArray(tags) ? tags : undefined,
      status,
      accessLevel,
      sourceUrl: sourceUrl || undefined,
      aiGenerated,
    });

    return Response.json({ success: true, id }, { status: 201 });
  } catch (error) {
    console.error("Create document error:", error);
    return Response.json({ error: "Failed to create document" }, { status: 500 });
  }
}
