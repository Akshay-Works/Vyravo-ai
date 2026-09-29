// ============================================================================
// SALES OS — meeting automation (§12). Polls Calendly for new bookings,
// matches invitee → lead, creates the meeting record, stops promotional
// outreach, generates the discovery brief, escalates to the founder.
// Idempotent via meetings.calendar_event_id.
// ============================================================================
import { pool } from "@/db";
import { isCalendlyConfigured, listScheduledEvents } from "@/lib/calendly";
import { ensureSalesSchema, logDecision, createEscalation } from "./schema";

import { buildDiscoveryBrief } from "./brief";

export const SALES_CALENDAR_URL =
  process.env.SALES_CALENDAR_URL || "https://calendly.com/akshay-navale-work";

async function inviteesFor(eventUri: string): Promise<{ email: string; name: string }[]> {
  try {
    const token = process.env.CALENDLY_ACCESS_TOKEN || "";
    if (!token) return [];
    const uuid = String(eventUri || "").split("/").filter(Boolean).pop();
    const res = await fetch(`https://api.calendly.com/scheduled_events/${uuid}/invitees`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.collection || []).map((i: any) => ({ email: String(i.email || ""), name: String(i.name || "") }));
  } catch {
    return [];
  }
}

export async function meetingTick(opts: { max?: number; budgetMs?: number } = {}): Promise<{
  checked: number; booked: number; skipped?: string;
}> {
  await ensureSalesSchema();
  if (!isCalendlyConfigured())
    return { checked: 0, booked: 0, skipped: "CALENDLY_ACCESS_TOKEN not set" };
  const max = Math.min(Math.max(opts.max || 5, 1), 15);
  const t0 = Date.now();
  const budget = opts.budgetMs || 20000;
  let checked = 0, booked = 0;
  let events: any[] = [];
  try {
    events = await listScheduledEvents({ count: 10, status: "active" });
  } catch (e: any) {
    await logDecision({ trigger_text: "meetingTick", action: "poll_failed", autonomy: "L1",
      reason: "Calendly poll failed", status: "failed", error_message: String(e?.message || e).slice(0, 200) });
    return { checked: 0, booked: 0, skipped: "poll failed (logged)" };
  }
  for (const ev of events.slice(0, max)) {
    if (Date.now() - t0 > budget) break;
    checked++;
    try {
      let email = String(ev.inviteeEmail || "").toLowerCase().trim();
      let name = String(ev.inviteeName || "").trim();
      if (!email) {
        const inv = await inviteesFor(ev.uri);
        email = String(inv[0]?.email || "").toLowerCase().trim();
        name = String(inv[0]?.name || "").trim();
      }
      if (!email) continue;
      const dup = await pool.query(`SELECT 1 FROM meetings WHERE calendar_event_id = $1 LIMIT 1`, [ev.uri]);
      if ((dup.rowCount ?? 0) > 0) continue;
      const lead = await pool.query(`SELECT id, business_name FROM leads WHERE lower(email) = $1 LIMIT 1`, [email]);
      if ((lead.rowCount ?? 0) === 0) {
        await logDecision({ trigger_text: "meetingTick", action: "unknown_invitee", autonomy: "L1",
          reason: `booking from unknown email ${email} — no lead matched`, context: { event: ev.uri }, result: "skipped" });
        continue;
      }
      const leadId = Number(lead.rows[0].id);
      const mins = ev.startTime && ev.endTime
        ? Math.max(5, Math.round((new Date(ev.endTime).getTime() - new Date(ev.startTime).getTime()) / 60000)) : 30;
      const mtg = await pool.query(
        `INSERT INTO meetings (title, lead_id, scheduled_at, duration, meeting_link, calendar_event_id, status, attendees)
         VALUES ($1,$2,$3,$4,$5,$6,'scheduled',$7) RETURNING id`,
        [`Discovery — ${lead.rows[0].business_name || email}`, leadId, ev.startTime ? new Date(ev.startTime) : new Date(),
         mins, null, ev.uri, JSON.stringify([{ email, name }])]);
      const meetingId = Number(mtg.rows[0].id);
      // Stop promotional outreach — a booked meeting ends the sales sequence.
      await pool.query(`UPDATE outreach_events SET status = 'cancelled' WHERE lead_id = $1 AND status IN ('queued','sending')`, [leadId]);
      await pool.query(`UPDATE email_queue SET status = 'skipped' WHERE lead_id = $1 AND status = 'pending' AND template_data->>'outreach_event_id' IS NOT NULL`, [leadId]);
      try {
        const { pauseChannels } = await import("./orchestrate");
        await pauseChannels(leadId, "meeting booked");
      } catch { /* channel pause is non-fatal */ }
      const brief = await buildDiscoveryBrief(leadId);
      await pool.query(`UPDATE leads SET meeting_status = 'scheduled', meeting_date = $2, meeting_brief = $3 WHERE id = $1`,
        [leadId, ev.startTime ? new Date(ev.startTime) : new Date(), brief]);
      await pool.query(`UPDATE meetings SET agenda = $2 WHERE id = $1`, [meetingId, brief]);
      await pool.query(`INSERT INTO activities (type, action, description, lead_id, created_at) VALUES ('lead','meeting_booked',$2,$1,now())`,
        [leadId, `Meeting booked (${ev.name || "Calendly"}) — brief generated, outreach stopped`]).catch(() => {});
      const { emitSalesEvent } = await import("./lifecycle");
      await emitSalesEvent({ key: `meeting-booked-${meetingId}`, type: "MEETING_BOOKED", leadId: Number(leadId),
        payload: { reason: `meeting booked: ${ev.name || "Calendly"}` } });
      await createEscalation({ lead_id: leadId, kind: "meeting_booked",
        title: `Meeting booked — brief ready`,
        detail: `${name || email} booked ${ev.name || "a meeting"} at ${ev.startTime || "?"}. Discovery brief saved on the lead + meeting.`,
        recommendation: "Read the brief, take the call. Paste notes afterwards to trigger proposal draft." });
      await logDecision({ lead_id: leadId, trigger_text: "meetingTick", to_stage: "meeting_booked",
        action: "meeting_booked", autonomy: "L1", reason: `Calendly booking matched ${email}`,
        context: { meeting_id: meetingId }, result: "booked" });
      booked++;
    } catch (e: any) {
      await logDecision({ trigger_text: "meetingTick", action: "booking_failed", autonomy: "L1",
        reason: "booking handling failed", status: "failed", error_message: String(e?.message || e).slice(0, 200) });
    }
  }
  return { checked, booked };
}

/**
 * No-show sweep: scheduled meetings that ended 2h+ ago with no notes.
 * Never auto-sends — drafts a held rebook email (L2 approval) + escalates.
 * Idempotent: flagged meetings flip to 'no_show' and never re-flag.
 */
export async function noShowTick(opts: { max?: number } = {}): Promise<{ flagged: number }> {
  await ensureSalesSchema();
  const max = Math.min(Math.max(opts.max || 5, 1), 20);
  const rows = await pool.query(
    `SELECT m.id, m.lead_id, m.title, m.scheduled_at, l.email, l.business_name, l.full_name
     FROM meetings m JOIN leads l ON l.id = m.lead_id
     WHERE m.status = 'scheduled' AND m.scheduled_at < now() - interval '2 hours'
       AND (m.summary IS NULL OR m.summary = '')
     ORDER BY m.scheduled_at DESC LIMIT $1`, [max]);
  let flagged = 0;
  for (const mtg of rows.rows as any[]) {
    try {
      const leadId = Number(mtg.lead_id);
      const nm = mtg.business_name || mtg.full_name || "there";
      const esc = (s: any) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").slice(0, 200);
      if (mtg.email) {
        const subject = `Sorry we missed each other — new time?`;
        const html = `<p>Hi ${esc(nm)},</p><p>Looks like we missed each other earlier. No worries at all — you can pick a new time here: <a href="${SALES_CALENDAR_URL}">${SALES_CALENDAR_URL}</a></p><p>If the timing isn't right, just reply and let me know.</p><p>— Akshay, Vyravo AI</p>`;
        const ins = await pool.query(
          `INSERT INTO email_queue (lead_id, email_type, scheduled_for, status, template_data, created_at)
           VALUES ($1,'no_show_followup', now(), 'held', $2, now()) RETURNING id`,
          [leadId, JSON.stringify({ to: mtg.email, subject, html, leadId, meetingId: mtg.id })]);
        await createEscalation({ lead_id: leadId, kind: "email_approval",
          title: `No-show follow-up needs approval (outbox #${ins.rows[0].id})`,
          detail: `Meeting "${mtg.title}" passed with no notes. Rebook draft held for review.`,
          recommendation: "Approve in Sales → Outbox to re-engage, or discard." });
      }
      await createEscalation({ lead_id: leadId, kind: "meeting_no_show",
        title: `📅 Possible no-show: ${String(nm).slice(0, 60)}`,
        detail: `Meeting "${mtg.title}" (${mtg.scheduled_at}) has no notes.`,
        recommendation: "Confirm no-show vs held-without-notes; approve the rebook draft if needed." });
      await pool.query(`UPDATE meetings SET status = 'no_show', updated_at = now() WHERE id = $1`, [mtg.id]);
      await pool.query(`UPDATE leads SET next_action = 'No-show follow-up drafted — approve in outbox', next_action_date = now() + interval '1 day' WHERE id = $1`, [leadId]).catch(() => {});
      await logDecision({ lead_id: leadId, trigger_text: "noShowTick", action: "no_show_flagged",
        autonomy: "L2", reason: `meeting #${mtg.id} passed without notes — held draft, not sent`,
        context: { meetingId: mtg.id }, result: "flagged" });
      flagged++;
    } catch { /* one bad meeting never breaks the sweep */ }
  }
  return { flagged };
}
