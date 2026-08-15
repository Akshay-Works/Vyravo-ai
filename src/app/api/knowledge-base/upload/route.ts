import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/knowledge-base/rate-limit";
import { createDocument, processDocument } from "@/lib/knowledge-base/engine";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const SUPPORTED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xlsx",
};

// POST /api/knowledge-base/upload — multipart/form-data
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
  { const rl = rateLimit("upload", clientIp(request)); if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec); }
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    const mime = file.type || "";
    let fileType = SUPPORTED_TYPES[mime];
    if (!fileType) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const byExt: Record<string, string> = {
        pdf: "pdf",
        docx: "docx",
        txt: "txt",
        md: "md",
        csv: "csv",
        xlsx: "xlsx",
      };
      fileType = byExt[ext];
      if (!fileType) {
        return Response.json(
          { error: "Unsupported file type. Supported: PDF, DOCX, TXT, Markdown, CSV, XLSX" },
          { status: 415 }
        );
      }
    }

    if (file.size > MAX_FILE_SIZE) {
      return Response.json({ error: "File too large. Maximum size is 25 MB" }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const title =
      formData.get("title")?.toString().trim() || file.name.replace(/\.[^.]+$/, "");
    const categoryId = formData.get("categoryId")
      ? Number(formData.get("categoryId"))
      : undefined;
    const accessLevel = (formData.get("accessLevel") as string) || "internal";
    const status = (formData.get("status") as string) || "draft";
    const sourceUrl = formData.get("sourceUrl")?.toString().trim() || undefined;
    const tagsRaw = formData.get("tags")?.toString() || "";
    const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);

    const documentId = await createDocument({
      title,
      categoryId,
      accessLevel: accessLevel as any,
      status: status as any,
      sourceUrl,
      tags,
      fileType,
      fileSize: file.size,
      originalFileName: file.name,
      buffer,
    });

    // Process in-band: extract → chunk → embed → index.
    let processing: Awaited<ReturnType<typeof processDocument>> | null = null;
    try {
      processing = await processDocument(documentId, buffer);
    } catch (e) {
      console.error("Initial processing failed (can retry later):", e);
    }

    return Response.json(
      {
        success: true,
        id: documentId,
        title,
        processing: processing || { ok: false, error: "Processing pending" },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Upload error:", error);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}
