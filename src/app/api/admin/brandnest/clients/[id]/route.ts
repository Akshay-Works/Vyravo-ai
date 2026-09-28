import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { getBrandNestClient, updateBrandNestClient } from "@/lib/brandnest/clients";
import { listProjects } from "@/lib/brandnest/projects";

export const dynamic = "force-dynamic";

// GET → client + aggregates + projects. PATCH → update BrandNest fields.
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const client = await getBrandNestClient(Number(id));
  if (!client) return Response.json({ error: "not found" }, { status: 404 });
  const projects = await listProjects(Number(id));
  return Response.json({ ok: true, client, projects });
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const leadId = Number(id);
  const { pool } = await import("@/db");
  try {
    const b = await request.json().catch(() => ({}));
    // Contact-field edits (unified lead row) with email-collision guard.
    const sets: string[] = [];
    const args: any[] = [leadId];
    const set = (col: string, v: any) => { args.push(v); sets.push(`${col} = $${args.length}`); };
    if (b.name !== undefined) set("full_name", String(b.name).slice(0, 200) || "BrandNest Client");
    if (b.company !== undefined) set("business_name", String(b.company).slice(0, 300) || null);
    if (b.phone !== undefined) set("phone", String(b.phone).slice(0, 60) || null);
    if (b.website !== undefined) set("business_website", String(b.website).slice(0, 300) || null);
    if (b.location !== undefined) set("city", String(b.location).slice(0, 120) || null);
    if (b.email !== undefined) {
      const em = String(b.email).toLowerCase().trim() || null;
      if (em) {
        const clash = await pool.query(`SELECT id FROM leads WHERE lower(email) = $1 AND id <> $2 LIMIT 1`, [em, leadId]);
        if ((clash.rowCount ?? 0) > 0) return Response.json({ error: `Email already belongs to contact #${clash.rows[0].id} — merge instead of duplicating.` }, { status: 409 });
      }
      set("email", em);
    }
    if (sets.length) {
      await pool.query(`UPDATE leads SET ${sets.join(", ")} WHERE id = $1`, args);
    }
    await updateBrandNestClient(leadId, {
      relationshipStatus: b.relationshipStatus, reactivationStatus: b.reactivationStatus,
      vyravoOpportunity: b.vyravoOpportunity, vyravoCategories: b.vyravoCategories,
      repeatValue: b.repeatValue ?? undefined, notes: b.notes,
      nextFollowUp: b.nextFollowUp, services: b.services,
    });
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e).slice(0, 300) }, { status: 400 });
  }
}

// DELETE — safe remove. Always deletes the BrandNest extension + projects;
// deletes the unified contact row ONLY if it has no Vyravo-side history.
export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const leadId = Number(id);
  const { pool } = await import("@/db");
  const lead = (await pool.query(`SELECT * FROM leads WHERE id = $1`, [leadId])).rows[0];
  if (!lead) return Response.json({ error: "not found" }, { status: 404 });
  const hasVyravo = await pool.query(
    `SELECT 1 FROM outreach_events WHERE lead_id = $1 LIMIT 1`, [leadId]).then((r) => (r.rowCount ?? 0) > 0).catch(() => false)
    || await pool.query(`SELECT 1 FROM inbox_messages WHERE lead_id = $1 LIMIT 1`, [leadId]).then((r) => (r.rowCount ?? 0) > 0).catch(() => false)
    || await pool.query(`SELECT 1 FROM proposals WHERE lead_id = $1 LIMIT 1`, [leadId]).then((r) => (r.rowCount ?? 0) > 0).catch(() => false)
    || await pool.query(`SELECT 1 FROM sales_invoices WHERE lead_id = $1 LIMIT 1`, [leadId]).then((r) => (r.rowCount ?? 0) > 0).catch(() => false)
    || String(lead.business_source || "vyravo_ai") !== "brandnest"
    || String(lead.stage || "new") !== "new";
  await pool.query(`DELETE FROM brandnest_projects WHERE lead_id = $1`, [leadId]);
  await pool.query(`DELETE FROM brandnest_clients WHERE lead_id = $1`, [leadId]);
  const { logDecision } = await import("@/lib/sales/schema");
  if (hasVyravo) {
    await logDecision({ lead_id: leadId, trigger_text: "brandnest", action: "brandnest_removed",
      autonomy: "none", reason: "BrandNest record removed by admin; unified contact kept (Vyravo history exists)", result: "extension-removed" });
    return Response.json({ ok: true, removed: "brandnest-only", note: "Contact kept — it has Vyravo history." });
  }
  await pool.query(`DELETE FROM sales_escalations WHERE lead_id = $1`, [leadId]);
  await pool.query(`DELETE FROM sales_decisions WHERE lead_id = $1`, [leadId]);
  await pool.query(`DELETE FROM sales_events WHERE lead_id = $1`, [leadId]);
  await pool.query(`DELETE FROM activities WHERE lead_id = $1`, [leadId]);
  await pool.query(`DELETE FROM leads WHERE id = $1`, [leadId]);
  return Response.json({ ok: true, removed: "full", note: "BrandNest-only contact fully deleted." });
}
