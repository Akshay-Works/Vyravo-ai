// ============================================================================
// SALES OS — referral handling. A referred contact becomes its OWN lead with
// its OWN lifecycle, linked back to the referrer. Never treated as cold.
// ============================================================================
import { pool } from "@/db";
import { ensureSalesSchema, logDecision } from "./schema";

export interface ReferralInput {
  name?: string | null;
  email: string;
  title?: string | null;
  phone?: string | null;
  company?: string | null;
  context?: string | null;
}

export async function handleReferral(fromLeadId: number, ref: ReferralInput): Promise<{
  leadId: number; created: boolean;
}> {
  await ensureSalesSchema();
  const email = String(ref.email || "").toLowerCase().trim();
  if (!email || !email.includes("@")) throw new Error("referral requires a valid email");

  const existing = await pool.query(`SELECT id FROM leads WHERE lower(email) = $1 LIMIT 1`, [email]);
  if ((existing.rowCount ?? 0) > 0) {
    const id = Number(existing.rows[0].id);
    await pool.query(
      `UPDATE leads SET referred_by_lead_id = COALESCE(referred_by_lead_id, $2) WHERE id = $1`, [id, fromLeadId]).catch(() => {});
    await logDecision({
      lead_id: id, trigger_text: "referral", action: "referral_linked", autonomy: "L1",
      reason: `referred by lead ${fromLeadId} (existing lead linked)`, context: { fromLeadId }, result: "linked",
    });
    return { leadId: id, created: false };
  }

  const referrer = (await pool.query(`SELECT business_name, city, country FROM leads WHERE id = $1`, [fromLeadId])).rows[0];
  const ins = await pool.query(
    `INSERT INTO leads (full_name, email, phone, business_name, city, country, stage, status, source,
       referred_by_lead_id, biggest_challenge, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,'new','active','referral',$7,$8,now()) RETURNING id`,
    [
      (ref.name || "").slice(0, 200) || null, email, (ref.phone || "").slice(0, 60) || null,
      (ref.company || referrer?.business_name || "").slice(0, 300) || null,
      referrer?.city || null, referrer?.country || null, fromLeadId,
      `Referred by lead ${fromLeadId}${ref.context ? `: ${String(ref.context).slice(0, 200)}` : ""}`,
    ]);
  const id = Number(ins.rows[0].id);
  await pool.query(
    `INSERT INTO activities (type, action, description, lead_id, created_at)
     VALUES ('lead','referral_created',$2,$1,now())`,
    [id, `Referral from lead ${fromLeadId} — own lifecycle started (warm, never cold)`]).catch(() => {});
  await logDecision({
    lead_id: id, trigger_text: "referral", to_stage: "new", action: "referral_created",
    autonomy: "L1", reason: `warm lead spawned from referral by ${fromLeadId}`,
    context: { fromLeadId, title: ref.title }, result: "created",
  });
  try {
    const { emitSalesEvent } = await import("./lifecycle");
    await emitSalesEvent({ key: `referral-created-${id}`, type: "LEAD_CREATED", leadId: id, payload: { fromLeadId } });
  } catch { /* non-fatal */ }
  return { leadId: id, created: true };
}
