import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { runOutreachPipeline } from "@/lib/outreach/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Hobby limit; batch cap keeps us well inside

// POST /api/admin/outreach/run?send=1 — manual "run pipeline now".
// Generates + queues emails for new leads always; sends only when AUTO
// OUTREACH is ON (or ?send=1 to send immediately, test mode still respected).
// POST /api/admin/outreach/run?poll=1 — check the Gmail inbox for replies
// (no emails generated or sent).
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const send = url.searchParams.get("send") === "1";
    const pollOnly = url.searchParams.get("poll") === "1";
    if (pollOnly) {
      const { pollGmailReplies, backfillSentMessageIds } = await import("@/lib/outreach/replies");
      const replyPoll = await pollGmailReplies();
      const bf = await backfillSentMessageIds();
      return Response.json({ ok: true, replyPoll, backfilled: bf.backfilled || 0 });
    }
    const result = await runOutreachPipeline({ send });
    return Response.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("Outreach run error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
