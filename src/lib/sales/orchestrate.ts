// ============================================================================
// SALES OS — multichannel orchestration (§8). The safety direction is fully
// automatic: email reply / meeting / DNC instantly pauses WhatsApp + LinkedIn
// sequences. The expansion direction is L2: suggestions escalate, the founder
// approves messages in the existing WA/LI dashboards (no blind cross-channel
// sends, ever).
// ============================================================================
import { pool } from "@/db";
import { logDecision, createEscalation } from "./schema";

const PRE_SEND = ["awaiting_approval", "approved", "queued", "pending"];

/** Skip all unsent WhatsApp/LinkedIn activities for a lead. Never throws. */
export async function pauseChannels(leadId: number, reason: string): Promise<{ paused: number }> {
  try {
    const r = await pool.query(
      `UPDATE outreach_activities SET status = 'skipped'
       WHERE lead_id = $1 AND channel IN ('whatsapp', 'linkedin') AND status = ANY($2)`,
      [leadId, PRE_SEND]);
    const n = r.rowCount ?? 0;
    if (n > 0)
      await logDecision({ lead_id: leadId, trigger_text: "pauseChannels", action: "channels_paused",
        autonomy: "L1", reason: `${n} WA/LI activit(ies) skipped — ${reason}`.slice(0, 300), result: "paused" });
    return { paused: n };
  } catch {
    return { paused: 0 };
  }
}

/** Nurture hook: reachable on another channel? Suggest it (L2, deduped). */
export async function suggestNextChannel(leadId: number): Promise<void> {
  try {
    const lead = (await pool.query(
      `SELECT business_name, email, whatsapp_number, whatsapp_opt_in_status, linkedin_url, linkedin_connection_status
       FROM leads WHERE id = $1`, [leadId])).rows[0];
    if (!lead) return;
    const channels: string[] = [];
    if (lead.whatsapp_number && lead.whatsapp_opt_in_status !== "opted_out") channels.push("WhatsApp");
    if (lead.linkedin_url && lead.linkedin_connection_status === "connected") channels.push("LinkedIn");
    if (!channels.length) return;
    await createEscalation({ lead_id: leadId, kind: "channel_suggest",
      title: `Email exhausted — try ${channels.join(" / ")}?`,
      detail: `${lead.business_name || lead.email} went to nurture (no email reply). Reachable on ${channels.join(" + ")}.`,
      recommendation: "Approve a message in the WhatsApp / LinkedIn dashboard to continue there." });
  } catch { /* suggestion failure is non-fatal */ }
}
