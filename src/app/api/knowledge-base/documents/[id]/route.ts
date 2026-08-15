import { NextRequest } from "next/server";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { kbDocuments, kbDocumentVersions, kbChunks } from "@/db/knowledge-schema";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/knowledge-base/rate-limit";
import {
  updateDocument,
  setDocumentStatus,
  deleteDocument,
} from "@/lib/knowledge-base/engine";

export const dynamic = "force-dynamic";

// GET /api/knowledge-base/documents/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const documentId = Number(id);
    if (!documentId) return Response.json({ error: "Invalid id" }, { status: 400 });

    const docs = await db
      .select()
      .from(kbDocuments)
      .where(eq(kbDocuments.id, documentId))
      .limit(1);

    if (docs.length === 0) {
      return Response.json({ error: "Document not found" }, { status: 404 });
    }
    const doc = docs[0];

    const [versions, chunksRows] = await Promise.all([
      db
        .select()
        .from(kbDocumentVersions)
        .where(eq(kbDocumentVersions.documentId, documentId))
        .orderBy(desc(kbDocumentVersions.version)),
      db
        .select({ id: kbChunks.id })
        .from(kbChunks)
        .where(eq(kbChunks.documentId, documentId)),
    ]);

    // Latest content lives in the newest version row
    const latestVersion = versions[0];

    return Response.json({
      document: {
        id: doc.id,
        title: doc.title,
        content: latestVersion?.content || "",
        type: doc.docType || "document",
        categoryId: doc.categoryId,
        tags: doc.tags,
        status: doc.status,
        accessLevel: doc.accessLevel,
        version: doc.version,
        sourceUrl: doc.sourceUri,
        fileType: doc.mimeType || doc.sourceType,
        fileSize: doc.fileSize,
        originalFileName: doc.fileName,
        processingStatus: doc.processingStatus,
        processingError: doc.processingError,
        processingStage: doc.processingStage,
        chunkCount: doc.chunkCount,
        sourceType: doc.sourceType,
        enrichmentStatus: doc.enrichmentStatus,
        enrichmentApproved: doc.enrichmentApproved,
        isArchived: doc.isArchived,
        publishedAt: doc.publishedAt,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
      versions: versions.map((v) => ({
        id: v.id,
        version: v.version,
        title: v.title,
        changeNote: v.changeSummary,
        createdAt: v.createdAt,
      })),
      chunkCount: chunksRows.length,
    });
  } catch (error) {
    console.error("Get document error:", error);
    return Response.json({ error: "Failed to load document" }, { status: 500 });
  }
}

// PATCH /api/knowledge-base/documents/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  { const rl = rateLimit("write", clientIp(request)); if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec); }

  try {
    const { id } = await params;
    const documentId = Number(id);
    const body = await request.json();

    if (body.status) {
      await setDocumentStatus(documentId, body.status);
    }

    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.content !== undefined) patch.content = body.content;
    if (body.type !== undefined) patch.type = body.type;
    if (body.categoryId !== undefined) patch.categoryId = body.categoryId;
    if (body.tags !== undefined) patch.tags = body.tags;
    if (body.accessLevel !== undefined) patch.accessLevel = body.accessLevel;
    if (body.sourceUrl !== undefined) patch.sourceUrl = body.sourceUrl;

    if (Object.keys(patch).length > 0) {
      await updateDocument(documentId, patch as any);
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Update document error:", error);
    return Response.json({ error: "Failed to update document" }, { status: 500 });
  }
}

// DELETE /api/knowledge-base/documents/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  { const rl = rateLimit("write", clientIp(_request)); if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec); }

  try {
    const { id } = await params;
    await deleteDocument(Number(id));
    return Response.json({ success: true });
  } catch (error) {
    console.error("Delete document error:", error);
    return Response.json({ error: "Failed to delete document" }, { status: 500 });
  }
}
