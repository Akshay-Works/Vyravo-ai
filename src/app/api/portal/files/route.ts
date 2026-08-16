import { NextRequest } from "next/server";
import { getPortalSession } from "@/lib/portal/auth";
import { getClientFiles, uploadFile } from "@/lib/portal/engine";
import { emitEvent } from "@/lib/workflows/engine";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = process.env.PORTAL_UPLOAD_DIR || "/tmp/portal-uploads";
const MAX_SIZE = 25 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, string> = {
  pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  gif: "image/gif", mp4: "video/mp4", mov: "video/quicktime", txt: "text/plain",
  md: "text/markdown", zip: "application/zip",
};

export async function GET(request: NextRequest) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") ? Number(searchParams.get("projectId")) : undefined;
    const files = await getClientFiles(session.clientId, projectId);
    return Response.json({ files });
  } catch (e) {
    console.error("Portal files error:", e);
    return Response.json({ error: "Failed to load files" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return Response.json({ error: "No file" }, { status: 400 });

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!ALLOWED_TYPES[ext]) return Response.json({ error: "File type not supported" }, { status: 415 });
    if (file.size > MAX_SIZE) return Response.json({ error: "File too large (max 25 MB)" }, { status: 413 });

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const storagePath = path.join(UPLOAD_DIR, safeName);
    await fs.writeFile(storagePath, buffer);

    const result = await uploadFile(session.clientId, {
      name: safeName,
      originalName: file.name,
      mimeType: file.type || ALLOWED_TYPES[ext] || "application/octet-stream",
      sizeBytes: file.size,
      storagePath,
      category: formData.get("category")?.toString() || "general",
      projectId: formData.get("projectId") ? Number(formData.get("projectId")) : undefined,
      uploadedBy: session.userId,
    });
    try { await emitEvent("deliverable_uploaded", { clientId: session.clientId, projectId: formData.get("projectId") ? Number(formData.get("projectId")) : undefined, metadata: { name: file.name, originalName: file.name } }); } catch {}
    return Response.json({ success: true, file: result }, { status: 201 });
  } catch (e) {
    console.error("Portal upload error:", e);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}
