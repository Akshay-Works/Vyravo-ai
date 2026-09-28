// ============================================================================
// BRANDNEST → VYRAVO conversion. SAME contact row, new business relationship:
// business_source flips to 'brandnest_to_vyravo', the BrandNest extension is
// preserved, and NO outreach is queued (cold auto-discovery only accepts
// 'vyravo_ai'; the founder releases this lead manually when ready).
// ============================================================================
import { pool } from "@/db";
import { ensureBrandNestSchema } from "./schema";
import { logDecision, createEscalation } from "@/lib/sales/schema";

export async function convertToVyravo(leadId: number, opts: {
  categories?: string[]; opportunity?: string; note?: string;
} = {}): Promise<{ leadId: number; already: boolean }> {
  await ensureBrandNestSchema();
  const lead = (await pool.query(`SELECT * FROM leads WHERE id = $1`, [leadId])).rows[0];
  if (!lead) throw new Error("lead not found");
  const biz = String(lead.business_source || "vyravo_ai");
  if (biz === "brandnest_to_vyravo") return { leadId, already: true };

  // Ensure the BrandNest side exists (preserved, never removed).
  await pool.query(
    `INSERT INTO brandnest_clients (lead_id, relationship_status) VALUES ($1,'converted_to_vyravo')
     ON CONFLICT (lead_id) DO UPDATE SET relationship_status = 'converted_to_vyravo',
       vyravo_opportunity = CASE WHEN brandnest_clients.vyravo_opportunity = 'none' THEN 'medium' ELSE brandnest_clients.vyravo_opportunity END,
       updated_at = now()`, [leadId]);
  if (opts.categories?.length || opts.opportunity) {
    await pool.query(
      `UPDATE brandnest_clients SET
         vyravo_categories = CASE WHEN $2::text[] <> '{}' THEN $2::text[] ELSE vyravo_categories END,
         vyravo_opportunity = COALESCE(NULLIF($3,''), vyravo_opportunity),
         updated_at = now() WHERE lead_id = $1`,
      [leadId, opts.categories?.slice(0, 10) || [], (opts.opportunity || "").slice(0, 10)]);
  }

  await pool.query(
    `UPDATE leads SET business_source = 'brandnest_to_vyravo',
       next_action = 'Warm BrandNest relationship — founder to start Vyravo discovery manually',
       next_action_date = now() + interval '3 days' WHERE id = $1`, [leadId]);

  // Safety proof: nothing queued by this conversion.
  const queued = Number((await pool.query(
    `SELECT count(*)::int n FROM outreach_events WHERE lead_id = $1 AND status IN ('queued','sending')`, [leadId])).rows[0]?.n || 0);

  await pool.query(
    `INSERT INTO activities (type, action, description, lead_id, created_at) VALUES ('lead','brandnest_converted',$2,$1,now())`,
    [leadId, `[VYRAVO] Converted to Vyravo opportunity (warm — BrandNest history preserved). No outreach queued.`]).catch(() => {});
  await logDecision({ lead_id: leadId, trigger_text: "brandnest", action: "brandnest_converted",
    autonomy: "none", reason: `converted to Vyravo opportunity by admin${opts.note ? `: ${opts.note.slice(0, 150)}` : ""}`,
    context: { categories: opts.categories || [], queued_events: queued }, result: "converted" });
  await createEscalation({ lead_id: leadId, kind: "brandnest_converted",
    title: `🌉 BrandNest → Vyravo: ${(lead.business_name || lead.email || leadId)} is now an opportunity`,
    detail: `Warm contact with BrandNest history. Categories: ${(opts.categories || []).join(", ") || "unspecified"}. No outreach queued — start Vyravo discovery manually.`,
    recommendation: "Review BrandNest history, then run Vyravo qualification/discovery by hand." }).catch(() => {});
  return { leadId, already: false };
}
