import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import {
  ensureWhatsAppSchema, generateToday, approveActivity, editMessage,
  regenerateMessage, skipActivity, retryActivity, sendBatch, markSent,
  markDelivered, markRead, markReplied, scheduleFollowUps, optOutLead, optInLead,
} from "@/lib/whatsapp/pipeline";
import { getWhatsAppConfig, saveWhatsAppConfig } from "@/lib/whatsapp/config";

export const dynamic = "force-dynamic";

// POST /api/admin/whatsapp/action { action, id?, leadId?, message? }
// actions: generate | simulate | send | approve | edit | regenerate | skip |
//          retry | mark_sent | mark_delivered | mark_read | mark_replied |
//          opt_out | opt_in | followups_run | stop | resume
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensureWhatsAppSchema();
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "");
    const id = Number(body.id || 0);
    const cfg = await getWhatsAppConfig();

    switch (action) {
      case "generate": {
        const r = await generateToday(cfg);
        return Response.json({ ok: true, ...r, message: `Generated ${r.generated} message(s); ${r.notEligible} lead(s) not eligible.` });
      }
      case "simulate": {
        const r = await sendBatch(cfg, { simulate: true });
        return Response.json({ ok: true, ...r, message: "TEST MODE \u2014 simulated send. No WhatsApp messages were sent." });
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
      case "mark_delivered": {
        if (!id) return Response.json({ error: "id required" }, { status: 400 });
        const r = await markDelivered(id);
        return Response.json(r.ok ? { ok: true, message: "Marked as delivered \u2713" } : { error: r.error }, { status: r.ok ? 200 : 400 });
      }
      case "mark_read": {
        if (!id) return Response.json({ error: "id required" }, { status: 400 });
        const r = await markRead(id);
        return Response.json(r.ok ? { ok: true, message: "Marked as read \u2713" } : { error: r.error }, { status: r.ok ? 200 : 400 });
      }
      case "mark_replied": {
        if (!id) return Response.json({ error: "id required" }, { status: 400 });
        const r = await markReplied(id);
        return Response.json(r.ok ? { ok: true, message: "Marked as replied \u2713 \u2014 follow-ups stopped" } : { error: r.error }, { status: r.ok ? 200 : 400 });
      }
      case "opt_out": {
        const leadId = Number(body.leadId || id || 0);
        if (!leadId) return Response.json({ error: "leadId required" }, { status: 400 });
        const r = await optOutLead(leadId, "manual");
        return Response.json({ ok: r.ok, message: "Lead opted out — no further WhatsApp outreach. Follow-ups cancelled." });
      }
      case "opt_in": {
        const leadId = Number(body.leadId || id || 0);
        if (!leadId) return Response.json({ error: "leadId required" }, { status: 400 });
        const r = await optInLead(leadId);
        return Response.json({ ok: r.ok, message: "Lead marked Opted In \u2014 eligible on next generation run." });
      }
      case "stop": {
        await saveWhatsAppConfig({ emergency_stop: true });
        return Response.json({ ok: true, message: "STOP ALL WHATSAPP OUTREACH \u2014 no messages can be sent until you resume." });
      }
      case "resume": {
        await saveWhatsAppConfig({ emergency_stop: false });
        return Response.json({ ok: true, message: "WhatsApp outreach resumed." });
      }
      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e: any) {
    console.error("WhatsApp action error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
