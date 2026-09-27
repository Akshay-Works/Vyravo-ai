import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { processEmailQueue } from "@/lib/email/process";
import { processOutreachQueue, ensureOutreachSchema } from "@/lib/outreach/pipeline";
import { getOutreachConfig } from "@/lib/outreach/config";
import { recordHeartbeat } from "@/lib/activity/heartbeat";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Hobby limit; batch cap keeps us well inside

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
    // daily workflow rescue (no 3rd Hobby cron needed)
    let workflows: any = { rescued: 0, failed: 0 };
    try {
      const { sweepStuckWorkflows } = await import("@/lib/workflows/engine");
      workflows = await sweepStuckWorkflows();
    } catch (e) { console.error("Cron workflow sweep error:", e); }
    let outreach: any = { sent: 0, failed: 0, skipped: 0, capped: false, auto: false };
    let replyPoll: any = { polled: 0, applied: 0, reason: "skipped" };
    try {
      await ensureOutreachSchema();
      // inbound replies first — a reply detected here stops follow-ups before send
      try {
        const { pollGmailReplies, backfillSentMessageIds } = await import("@/lib/outreach/replies");
        replyPoll = await pollGmailReplies();
        const bf = await backfillSentMessageIds();
        replyPoll = { ...replyPoll, backfilled: bf.backfilled || 0 };
      } catch (e: any) {
        console.error("Cron reply-poll error:", e?.message);
        replyPoll = { ...replyPoll, errors: 1, reason: String(e?.message || e).slice(0, 150) };
      }
      const cfg = await getOutreachConfig();
      // AUTO OUTREACH OFF ⇒ the cron must never send outreach emails
      // (manual "Process queue now" / "Send now" still work)
      if (cfg.auto_outreach) {
        outreach = { ...(await processOutreachQueue(cfg)), auto: true };
      } else {
        outreach.auto = false;
      }
    } catch (e) { console.error("Cron outreach error:", e); }
    // Inbox intelligence tick — bounded, DB-backed; never breaks the cron.
    let inbox: any = { claimed: 0 };
    try {
      const { processInboxTick } = await import("@/lib/email-intel/process");
      inbox = await processInboxTick({ maxMessages: 8, budgetMs: 20000 });
    } catch (e: any) {
      inbox = { claimed: 0, error: String(e?.message || e).slice(0, 160) };
    }
    // Sales OS sweep — bounded; never breaks the cron.
    let sales: any = { nurtured: 0 };
    try {
      const { salesTick } = await import("@/lib/sales/decide");
      sales = await salesTick({ max: 25, budgetMs: 10000 });
    } catch (e: any) {
      sales = { nurtured: 0, error: String(e?.message || e).slice(0, 160) };
    }
    // Sales OS research — bounded website enrichment; never breaks the cron.
    let research: any = { researched: 0 };
    try {
      const { researchTick } = await import("@/lib/sales/research");
      research = await researchTick({ max: 3, budgetMs: 15000 });
    } catch (e: any) {
      research = { researched: 0, error: String(e?.message || e).slice(0, 160) };
    }
    // Sales OS meetings — bounded Calendly poll; never breaks the cron.
    let meetings: any = { booked: 0 };
    try {
      const { meetingTick } = await import("@/lib/sales/meetings");
      meetings = await meetingTick({ max: 5, budgetMs: 20000 });
    } catch (e: any) {
      meetings = { booked: 0, error: String(e?.message || e).slice(0, 160) };
    }
    // Morning sales report — yesterday's numbers emailed to the founder.
    let reportMail = "skipped";
    try {
      const to = (process.env.REPORT_EMAIL || "").trim();
      if (to) {
        const { getSalesMetrics, getFounderActions, getRecentFailures } = await import("@/lib/sales/metrics");
        const { sendEmail } = await import("@/lib/email/send");
        const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const m = await getSalesMetrics(y);
        const acts = await getFounderActions(10);
        const fails = await getRecentFailures(5);
        const esc = (s: any) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").slice(0, 300);
        const li = (o: any) => Object.entries(o).map(([k, v]) => `${String(k).replace(/_/g, " ")}: ${v}`).join(" · ");
        await sendEmail({ to, subject: `📊 Sales ${y} — ${m.today.replies} replies, ${m.today.meetings_booked} meetings, ${acts.length} need you`,
          html: `<h3>Yesterday (${y})</h3><p>${esc(li(m.today))}</p><h3>AI activity</h3><p>${esc(li(m.ai))}</p><h3>Founder actions (${acts.length})</h3>${acts.map((a: any) => `<p>• <b>${esc(a.title)}</b> — ${esc(a.recommendation)}</p>`).join("") || "<p>None. ✓</p>"}<h3>Problems (${fails.length})</h3>${fails.map((f: any) => `<p>• [${esc(f.source)}] ${esc(f.error)}</p>`).join("") || "<p>None. ✓</p>"}` });
        reportMail = "sent";
      }
    } catch (e: any) { console.error("sales report mail failed:", e); reportMail = "error"; }
    await recordHeartbeat("cron_emails", "ok", { sent: outreach?.sent ?? 0, failed: outreach?.failed ?? 0, replyPolled: replyPoll?.polled ?? 0, replyApplied: replyPoll?.applied ?? 0, inbox, sales, research, meetings, reportMail, workflows });
    return Response.json({ ok: true, ...result, outreach, replyPoll, inbox, sales, research, meetings, reportMail, workflows });
  } catch (e) {
    console.error("Cron email error:", e);
    await recordHeartbeat("cron_emails", "error", {});
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}
