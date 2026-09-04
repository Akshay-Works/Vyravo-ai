import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import {
  ensureLinkedInSchema, generateToday, approveActivity, editMessage,
  regenerateMessage, skipActivity, retryActivity, sendBatch, markSent,
  markReplied, scheduleFollowUps,
} from "@/lib/linkedin/pipeline";
import { getLinkedInConfig, saveLinkedInConfig } from "@/lib/linkedin/config";

export const dynamic = "force-dynamic";

// POST /api/admin/linkedin/action { action, id?, message? }
// actions: generate | simulate | send | approve | edit | regenerate | skip |
//          retry | mark_sent | mark_replied | followups_run | stop | resume
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensureLinkedInSchema();
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "");
    const id = Number(body.id || 0);
    const cfg = await getLinkedInConfig();

    switch (action) {
      case "generate": {
        const r = await generateToday(cfg);
        return Response.json({ ok: true, ...r, message: `Generated ${r.generated} message(s); ${r.notEligible} lead(s) not eligible.` });
      }
      case "simulate": {
        const r = await sendBatch(cfg, { simulate: true });
        return Response.json({ ok: true, ...r, message: "TEST MODE \u2014 simulated send. No LinkedIn messages were sent." });
      }
      case "send": {
        const fu = await scheduleFollowUps(cfg);
        const r = await sendBatch(cfg);
        return Response.json({ ok: true, ...r, followupsScheduled: fu });
      }
      case "followups_run": {
        const n = await scheduleFollowUps(cfg);
        return Response.json({ ok: true, scheduled: n, message: `Scheduled ${n} follow-up(s).` });
      }
      case "approve": {
        if (!id) return Response.json({ error: "id required" }, { status: 400 });
        const r = await approveActivity(id);
        return Response.json(r.ok ? { ok: true, message: "Approved & queued \u2713" } : { error: r.error }, { status: r.ok ? 200 : 400 });
      }
      case "edit": {
        if (!id) return Response.json({ error: "id required" }, { status: 400 });
        const r = await editMessage(id, String(body.message || ""));
        return Response.json(r.ok ? { ok: true, message: "Message updated \u2713" } : { error: r.error }, { status: r.ok ? 200 : 400 });
      }
      case "regenerate": {
        if (!id) return Response.json({ error: "id required" }, { status: 400 });
        const r = await regenerateMessage(id);
        return Response.json(r.ok ? { ok: true, message: "Regenerated \u2713", messageText: r.message } : { error: r.error }, { status: r.ok ? 200 : 400 });
      }
      case "skip": {
        if (!id) return Response.json({ error: "id required" }, { status: 400 });
        const r = await skipActivity(id);
        return Response.json(r.ok ? { ok: true, message: "Skipped" } : { error: r.error }, { status: r.ok ? 200 : 400 });
      }
      case "retry": {
        if (!id) return Response.json({ error: "id required" }, { status: 400 });
        const r = await retryActivity(id);
        return Response.json(r.ok ? { ok: true, message: "Moved back to queue for retry \u2713" } : { error: r.error }, { status: r.ok ? 200 : 400 });
      }
      case "mark_sent": {
        if (!id) return Response.json({ error: "id required" }, { status: 400 });
        const r = await markSent(id);
        return Response.json(r.ok ? { ok: true, message: "Marked as sent (manual) \u2713" } : { error: r.error }, { status: r.ok ? 200 : 400 });
      }
      case "mark_replied": {
        if (!id) return Response.json({ error: "id required" }, { status: 400 });
        const r = await markReplied(id);
        return Response.json(r.ok ? { ok: true, message: "Marked as replied \u2713 \u2014 follow-ups stopped" } : { error: r.error }, { status: r.ok ? 200 : 400 });
      }
      case "stop": {
        await saveLinkedInConfig({ emergency_stop: true });
        return Response.json({ ok: true, message: "STOP ALL OUTREACH \u2014 no LinkedIn messages can be sent until you resume." });
      }
      case "resume": {
        await saveLinkedInConfig({ emergency_stop: false });
        return Response.json({ ok: true, message: "Outreach resumed." });
      }
      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e: any) {
    console.error("LinkedIn action error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
