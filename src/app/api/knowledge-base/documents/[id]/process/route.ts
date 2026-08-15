import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/knowledge-base/rate-limit";
import { processDocument } from "@/lib/knowledge-base/engine";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { kbDocuments, kbDocumentBlobs } from "@/db/knowledge-schema";

export const dynamic = "force-dynamic";

// POST /api/knowledge-base/documents/[id]/process
// Reprocess a document (retry after failure, or re-index after edit)
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  { const rl = rateLimit("write", clientIp(_request)); if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec); }

  try {
    const { id } = await params;
    const documentId = Number(id);

    const docs = await db
      .select({ id: kbDocuments.id, sourceType: kbDocuments.sourceType })
      .from(kbDocuments)
      .where(eq(kbDocuments.id, documentId))
      .limit(1);

    if (docs.length === 0) {
      return Response.json({ error: "Document not found" }, { status: 404 });
    }

    // Reload original file bytes from blob storage if available
    let buffer: Buffer | undefined;
    try {
      const blobs = await db
        .select({ data: kbDocumentBlobs.data })
        .from(kbDocumentBlobs)
        .where(eq(kbDocumentBlobs.documentId, documentId))
        .limit(1);
      if (blobs[0]?.data) {
        buffer = Buffer.from(blobs[0].data, "base64");
      }
    } catch {
      buffer = undefined;
    }

    const result = await processDocument(documentId, buffer);

    if (!result.ok) {
      return Response.json({ error: result.error || "Processing failed" }, { status: 422 });
    }

    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("Process document error:", error);
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
