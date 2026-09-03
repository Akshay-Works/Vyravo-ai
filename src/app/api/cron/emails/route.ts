import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { processEmailQueue } from "@/lib/email/process";
import { processOutreachQueue, ensureOutreachSchema } from "@/lib/outreach/pipeline";
import { getOutreachConfig } from "@/lib/outreach/config";

export const dynamic = "force-dynamic";

// GET /api/cron/emails — Vercel Cron trigger for the real email worker.
// If CRON_SECRET is set, Vercel sends it as `Authorization: Bearer ...` and we verify it.
export async function GET(request: NextRequest) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) {
    return Response.json({ error: "CRON_SECRET not set" }, { status: 503 });
  }
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await processEmailQueue(50);
    let outreach: any = { sent: 0, failed: 0, skipped: 0, capped: false, auto: false };
    try {
      await ensureOutreachSchema();
      const cfg = await getOutreachConfig();
      // AUTO OUTREACH OFF ⇒ the cron must never send outreach emails
      // (manual "Process queue now" / "Send now" still work)
      if (cfg.auto_outreach) {
        outreach = { ...(await processOutreachQueue(cfg)), auto: true };
      } else {
        outreach.auto = false;
      }
    } catch (e) { console.error("Cron outreach error:", e); }
    return Response.json({ ok: true, ...result, outreach });
  } catch (e) {
    console.error("Cron email error:", e);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}
