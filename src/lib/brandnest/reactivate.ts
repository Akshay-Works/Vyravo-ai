// ============================================================================
// BRANDNEST reactivation — classification + follow-up TASKS. Nothing is ever
// auto-sent: "ready" only means a task exists for the founder; any actual
// message must go through the same held-outbox approval as Vyravo L2 mail.
// ============================================================================
import { pool } from "@/db";
import { ensureBrandNestSchema } from "./schema";
import { logDecision, createEscalation } from "@/lib/sales/schema";

/** Heuristic suggestion from spend/recency/projects (founder decides). */
export async function suggestReactivation(leadId: number): Promise<{ suggestion: string; reasons: string[] }> {
  await ensureBrandNestSchema();
  const c = (await pool.query(
    `SELECT b.*, l.email,
       (SELECT COALESCE(sum(amount) FILTER (WHERE status='paid'),0)::numeric FROM brandnest_projects p WHERE p.lead_id = $1) AS spent,
       (SELECT count(*)::int FROM brandnest_projects p WHERE p.lead_id = $1 AND status = 'paid') AS paid_n,
       (SELECT max(payment_date) FROM brandnest_projects p WHERE p.lead_id = $1 AND status = 'paid') AS last_pay
     FROM brandnest_clients b LEFT JOIN leads l ON l.id = b.lead_id WHERE b.lead_id = $1`, [leadId])).rows[0];
  if (!c) return { suggestion: "manual_review", reasons: ["no BrandNest record"] };
  const reasons: string[] = [];
  if (String(c.reactivation_status) === "do_not_contact") return { suggestion: "do_not_contact", reasons: ["founder set Do Not Contact"] };
  const spent = Number(c.spent || 0);
  const months = c.last_pay ? (Date.now() - new Date(c.last_pay).getTime()) / 2592000000 : 999;
  if (!c.email) { reasons.push("no email on file"); }
  if (spent <= 0) reasons.push("no paid history");
  if (months > 18) reasons.push(`last payment ${Math.round(months)} months ago`);
  if (spent > 0 && c.email && months <= 18 && Number(c.paid_n) >= 1) {
    reasons.push(`${c.paid_n} paid project(s), ₹${spent}, ${Math.round(months)}mo ago`);
    return { suggestion: spent >= 10000 || Number(c.paid_n) >= 2 ? "ready" : "manual_review", reasons };
  }
  return { suggestion: "manual_review", reasons: reasons.length ? reasons : ["insufficient signal"] };
}

export async function setReactivation(leadId: number, status: string, actor = "admin"): Promise<void> {
  await ensureBrandNestSchema();
  const s = ["do_not_contact", "manual_review", "ready", "active"].includes(status) ? status : "manual_review";
  await pool.query(`UPDATE brandnest_clients SET reactivation_status = $2, updated_at = now() WHERE lead_id = $1`, [leadId, s]);
  await pool.query(
    `INSERT INTO activities (type, action, description, lead_id, created_at) VALUES ('lead','brandnest_reactivation',$2,$1,now())`,
    [leadId, `[BRANDNEST] Reactivation → ${s} (by ${actor}; nothing auto-sent)`]).catch(() => {});
  await logDecision({ lead_id: leadId, trigger_text: "brandnest", action: "reactivation_set",
    autonomy: "none", reason: `reactivation status → ${s}`, result: s });
}

/** Create a founder follow-up task (escalation), optionally flagging high value. */
export async function createReactivationTask(leadId: number, note?: string): Promise<{ id: number }> {
  await ensureBrandNestSchema();
  const c = (await pool.query(
    `SELECT l.business_name, l.email,
       (SELECT COALESCE(sum(amount) FILTER (WHERE status='paid'),0)::numeric FROM brandnest_projects p WHERE p.lead_id = $1) AS spent
     FROM leads l WHERE l.id = $1`, [leadId])).rows[0];
  const spent = Number(c?.spent || 0);
  const r = await createEscalation({ lead_id: leadId,
    kind: spent >= 10000 ? "brandnest_reactivation_hot" : "brandnest_reactivation",
    title: `${spent >= 10000 ? "🔥 High-value" : "📞"} BrandNest reactivation: ${(c?.business_name || c?.email || leadId)}`,
    detail: `Historical spend ₹${spent}.${note ? ` ${note.slice(0, 300)}` : ""} Reach out manually — or draft via the held outbox for approval.`,
    recommendation: "Personal message referencing past work; do not cold-template." });
  await setReactivation(leadId, "active", "system-task");
  return { id: r.id };
}

/** Score every contactable client; auto-mark 'ready' only (never DNC/active). */
export async function scoreAllReactivation(): Promise<{ scored: number; ready: number }> {
  await ensureBrandNestSchema();
  const rows = await pool.query(`SELECT lead_id FROM brandnest_clients WHERE reactivation_status NOT IN ('do_not_contact','active')`);
  let scored = 0, ready = 0;
  for (const r of rows.rows as any[]) {
    try {
      const s = await suggestReactivation(Number(r.lead_id));
      scored++;
      if (s.suggestion === "ready") {
        await pool.query(`UPDATE brandnest_clients SET reactivation_status = 'ready', updated_at = now()
          WHERE lead_id = $1 AND reactivation_status NOT IN ('do_not_contact','active')`, [r.lead_id]);
        ready++;
      }
    } catch { /* one bad row never breaks the sweep */ }
  }
  return { scored, ready };
}

/**
 * Warm reactivation draft referencing real past work. HELD for founder
 * approval in the same outbox as Vyravo L2 mail — never auto-sent.
 */
export async function draftReactivationEmail(leadId: number): Promise<{ id: number | null; skipped: string | null }> {
  await ensureBrandNestSchema();
  const c = (await pool.query(
    `SELECT l.full_name, l.business_name, l.email, b.reactivation_status,
       (SELECT service FROM brandnest_projects p WHERE p.lead_id = $1 ORDER BY COALESCE(payment_date, created_date) DESC LIMIT 1) AS last_service,
       (SELECT COALESCE(sum(amount) FILTER (WHERE status='paid'),0)::numeric FROM brandnest_projects p WHERE p.lead_id = $1) AS spent
     FROM leads l JOIN brandnest_clients b ON b.lead_id = l.id WHERE l.id = $1`, [leadId])).rows[0];
  if (!c) return { id: null, skipped: "no BrandNest record" };
  if (String(c.reactivation_status) === "do_not_contact") return { id: null, skipped: "Do Not Contact" };
  if (!c.email) return { id: null, skipped: "no email on file" };
  const open = await pool.query(`SELECT id FROM sales_escalations WHERE lead_id = $1 AND kind = 'email_approval' AND status = 'open' LIMIT 1`, [leadId]);
  if ((open.rowCount ?? 0) > 0) return { id: null, skipped: "a draft is already awaiting approval" };

  const esc = (s: any) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").slice(0, 200);
  const first = String(c.full_name || "").trim().split(/\s+/)[0] || "there";
  const subject = `Long time — quick idea for ${c.business_name || first}`;
  const ref = c.last_service ? ` (loved working on your ${c.last_service} last time)` : "";
  const html = `<p>Hi ${esc(first)},</p><p>Akshay here — we worked together through BrandNest Studio${esc(ref)}. I'm now building AI systems for businesses like yours at Vyravo (missed-call handling, WhatsApp follow-ups, review collection — live in weeks, not months).</p><p>Worth a 15-minute chat to see if any of it fits ${esc(c.business_name || "your business")}? No pitch if it doesn't.</p><p>— Akshay</p>`;
  const ins = await pool.query(
    `INSERT INTO email_queue (lead_id, email_type, scheduled_for, status, template_data, created_at)
     VALUES ($1,'brandnest_reactivation', now(), 'held', $2, now()) RETURNING id`,
    [leadId, JSON.stringify({ to: c.email, subject, html, leadId })]);
  const hid = Number(ins.rows[0].id);
  await createEscalation({ lead_id: leadId, kind: "email_approval",
    title: `BrandNest reactivation draft needs approval (outbox #${hid})`,
    detail: `Warm draft to ${c.email} referencing past work${c.spent ? ` (₹${c.spent} historical)` : ""}.`,
    recommendation: "Review in Sales → Outbox, then approve or discard." });
  await pool.query(`INSERT INTO activities (type, action, description, lead_id, created_at) VALUES ('lead','brandnest_draft',$2,$1,now())`,
    [leadId, `[BRANDNEST] Reactivation draft #${hid} held for approval (never auto-sent)`]).catch(() => {});
  await logDecision({ lead_id: leadId, trigger_text: "brandnest", action: "reactivation_drafted",
    autonomy: "L2", reason: `warm draft held in outbox #${hid}`, result: "held" });
  return { id: hid, skipped: null };
}
