import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { processEmailQueue } from "@/lib/email/process";

export const dynamic = "force-dynamic";

// POST /api/admin/emails/process — admin-only. Runs the email worker NOW.
// Use this after queueing personalized emails instead of waiting for a cron.
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const limit = Math.min(Math.max(Number(new URL(request.url).searchParams.get("limit") || "50"), 1), 200);
    const result = await processEmailQueue(limit);
    return Response.json({ ok: true, ...result, at: new Date().toISOString() });
  } catch (e: any) {
    console.error("Email process error:", e);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}
