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
