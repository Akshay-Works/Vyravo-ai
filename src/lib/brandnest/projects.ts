// ============================================================================
// BRANDNEST STUDIO — lightweight project/transaction ledger. Recording a
// project/payment NEVER triggers Vyravo outreach or lifecycle moves; it only
// raises quiet admin notifications (escalations) on real money events.
// ============================================================================
import { pool } from "@/db";
import { ensureBrandNestSchema } from "./schema";
import { logDecision, createEscalation } from "@/lib/sales/schema";

export interface ProjectInput {
  leadId: number;
  service: string;
  amount: number;
  currency?: string;
  status?: string;
  deliveryDate?: string | null;
  paymentDate?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
}

export async function createProject(p: ProjectInput): Promise<{ id: number }> {
  await ensureBrandNestSchema();
  if (!p.leadId || !p.service?.trim()) throw new Error("leadId + service required");
  if (!(Number(p.amount) >= 0)) throw new Error("amount must be >= 0");
  const ins = await pool.query(
    `INSERT INTO brandnest_projects (lead_id, service, amount, currency, status, delivery_date, payment_date, payment_method, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [p.leadId, p.service.slice(0, 200), Number(p.amount), (p.currency || "INR").slice(0, 8),
     (p.status || "pending").slice(0, 20), p.deliveryDate || null,
     p.paymentDate || ((p.status || "") === "paid" ? new Date().toISOString() : null),
     (p.paymentMethod || "").slice(0, 60), (p.notes || "").slice(0, 2000)]);
  const id = Number(ins.rows[0].id);
  await pool.query(
    `INSERT INTO activities (type, action, description, lead_id, created_at)
     VALUES ('lead','brandnest_project',$2,$1,now())`,
    [p.leadId, `[BRANDNEST] Project #${id}: ${p.service.slice(0, 80)} — ${p.currency || "INR"} ${p.amount} (${p.status || "pending"})`]).catch(() => {});
  await logDecision({ lead_id: p.leadId, trigger_text: "brandnest", action: "brandnest_project",
    autonomy: "none", reason: `project #${id} recorded: ${p.service} ${p.amount}`.slice(0, 300),
    context: { projectId: id }, result: p.status || "pending" });

  if ((p.status || "") === "paid") await onProjectPaid(p.leadId, id, Number(p.amount), p.currency || "INR");
  else {
    const lead = (await pool.query(`SELECT business_name, email FROM leads WHERE id = $1`, [p.leadId])).rows[0];
    await createEscalation({ lead_id: p.leadId, kind: "brandnest_project",
      title: `🆕 BrandNest project: ${p.service.slice(0, 60)}`,
      detail: `${lead?.business_name || lead?.email || p.leadId} — ${p.currency || "INR"} ${p.amount}, status ${p.status || "pending"}.`,
      recommendation: "Track delivery; mark paid when money arrives." }).catch(() => {});
  }
  return { id };
}

export async function updateProject(id: number, patch: {
  status?: string; amount?: number; deliveryDate?: string | null; paymentDate?: string | null;
  paymentMethod?: string | null; notes?: string; service?: string;
}): Promise<void> {
  await ensureBrandNestSchema();
  const cur = (await pool.query(`SELECT * FROM brandnest_projects WHERE id = $1`, [id])).rows[0];
  if (!cur) throw new Error("project not found");
  const sets: string[] = [];
  const args: any[] = [id];
  const set = (col: string, v: any) => { args.push(v); sets.push(`${col} = $${args.length}`); };
  if (patch.status) set("status", patch.status.slice(0, 20));
  if (patch.amount !== undefined) set("amount", Number(patch.amount));
  if (patch.deliveryDate !== undefined) set("delivery_date", patch.deliveryDate);
  if (patch.paymentDate !== undefined) set("payment_date", patch.paymentDate);
  if (patch.paymentMethod !== undefined) set("payment_method", String(patch.paymentMethod).slice(0, 60));
  if (patch.notes !== undefined) set("notes", String(patch.notes).slice(0, 2000));
  if (patch.service) set("service", patch.service.slice(0, 200));
  if (!sets.length) return;
  await pool.query(`UPDATE brandnest_projects SET ${sets.join(", ")} WHERE id = $1`, args);
  await pool.query(
    `INSERT INTO activities (type, action, description, lead_id, created_at) VALUES ('lead','brandnest_project_update',$2,$1,now())`,
    [cur.lead_id, `[BRANDNEST] Project #${id} updated: ${Object.keys(patch).join(", ")}`]).catch(() => {});
  if (patch.status === "paid" && cur.status !== "paid") {
    await pool.query(`UPDATE brandnest_projects SET payment_date = COALESCE(payment_date, now()) WHERE id = $1`, [id]);
    await onProjectPaid(Number(cur.lead_id), id, Number(patch.amount ?? cur.amount), cur.currency);
  }
}

async function onProjectPaid(leadId: number, projectId: number, amount: number, currency: string): Promise<void> {
  const paidCount = Number((await pool.query(
    `SELECT count(*)::int n FROM brandnest_projects WHERE lead_id = $1 AND status = 'paid'`, [leadId])).rows[0]?.n || 0);
  const lead = (await pool.query(`SELECT business_name, email FROM leads WHERE id = $1`, [leadId])).rows[0];
  const nm = lead?.business_name || lead?.email || `lead ${leadId}`;
  await pool.query(
    `INSERT INTO activities (type, action, description, lead_id, created_at) VALUES ('lead','brandnest_paid',$2,$1,now())`,
    [leadId, `[BRANDNEST] Payment received: ${currency} ${amount} (project #${projectId})`]).catch(() => {});
  if (paidCount >= 2) {
    await pool.query(`UPDATE brandnest_clients SET relationship_status = 'repeat_client', updated_at = now() WHERE lead_id = $1`, [leadId]);
    await createEscalation({ lead_id: leadId, kind: "brandnest_repeat",
      title: `🔁 BrandNest repeat client: ${String(nm).slice(0, 60)}`,
      detail: `${paidCount} paid projects. Latest: ${currency} ${amount} (#${projectId}).`,
      recommendation: "Consider flagging a Vyravo opportunity for this proven buyer." }).catch(() => {});
  } else {
    await createEscalation({ lead_id: leadId, kind: "brandnest_payment",
      title: `💰 BrandNest payment: ${currency} ${amount}`,
      detail: `${nm} — project #${projectId} paid.`,
      recommendation: "None — ledger updated automatically." }).catch(() => {});
  }
}

export async function listProjects(leadId?: number, limit = 100): Promise<any[]> {
  await ensureBrandNestSchema();
  const r = leadId
    ? await pool.query(`SELECT * FROM brandnest_projects WHERE lead_id = $1 ORDER BY created_date DESC LIMIT $2`, [leadId, limit])
    : await pool.query(
      `SELECT p.*, l.business_name, l.full_name, l.email FROM brandnest_projects p
       LEFT JOIN leads l ON l.id = p.lead_id ORDER BY p.created_date DESC LIMIT $1`, [limit]);
  return r.rows;
}
