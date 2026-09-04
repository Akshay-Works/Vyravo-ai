// ============================================================================
// WHATSAPP OUTREACH PIPELINE — daily leads → eligibility → phone validation
// → personalization → message generation → Awaiting Approval → Approve &
// Queue → OFFICIAL Meta WhatsApp Business API → delivery/read webhooks →
// reply + opt-out handling → Day 3 / Day 7 follow-ups → analytics.
//
// Built as channel = 'whatsapp' on the shared outreach_activities model
// (same tables the LinkedIn channel uses — no duplicate architecture).
//
// SAFETY CONTRACT
// • Nothing sends unless enabled + approval honoured + TEST OFF + no
//   emergency stop + Meta API configured + an approved template exists.
// • Phone number ≠ consent: the opt-in gate blocks every lead that has not
//   explicitly been recorded as Opted In (config require_opt_in, default ON).
// • Recipient is ALWAYS the CRM lead's own normalized phone — dynamic.
// • UNIQUE(lead_id, channel, follow_up_number) prevents duplicate outreach.
// ============================================================================
import { pool } from "@/db";
import { getWhatsAppConfig, type WhatsAppConfig } from "./config";
import { normalizeWhatsAppPhone, isValidWhatsAppNumber, maskWhatsAppNumber } from "./phone";
import { generateWhatsAppMessage, generateWhatsAppFollowUp, type WhatsAppGenResult } from "./generator";
import { sendTemplateMessage, isOptOutMessage, isWhatsConfigured } from "./sender";

const BLOCKED_LEAD_STATUSES = ["contacted", "replied", "won", "lost", "do_not_contact", "skipped", "completed", "opted_out"];

// ---------------------------------------------------------------------------
// SCHEMA (idempotent)
// ---------------------------------------------------------------------------
export async function ensureWhatsAppSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS outreach_activities (
      id serial PRIMARY KEY,
      lead_id integer NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      channel text NOT NULL DEFAULT 'linkedin',
      follow_up_number integer NOT NULL DEFAULT 0,
      message text NOT NULL,
      status text NOT NULL DEFAULT 'awaiting_approval',
      personalization_summary text,
      personalization_data jsonb,
      provider_message_id text,
      framework text,
      ai_generated boolean NOT NULL DEFAULT false,
      scheduled_at timestamptz,
      queued_at timestamptz,
      approved_at timestamptz,
      sent_at timestamptz,
      replied_at timestamptz,
      follow_up_date timestamptz,
      error text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      UNIQUE (lead_id, channel, follow_up_number)
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_oa_channel_status ON outreach_activities(channel, status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_oa_lead ON outreach_activities(lead_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_oa_sent ON outreach_activities(sent_at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_oa_provider_msg ON outreach_activities(provider_message_id)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS whatsapp_config (k text PRIMARY KEY, v text NOT NULL)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_send_log (
      id serial PRIMARY KEY,
      activity_id integer NOT NULL REFERENCES outreach_activities(id) ON DELETE CASCADE,
      sent_at timestamptz DEFAULT now()
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_replies (
      id serial PRIMARY KEY,
      lead_id integer NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      activity_id integer REFERENCES outreach_activities(id) ON DELETE SET NULL,
      from_number text NOT NULL,
      body text NOT NULL,
      received_at timestamptz DEFAULT now()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wa_replies_lead ON whatsapp_replies(lead_id)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_templates (
      id serial PRIMARY KEY,
      name text NOT NULL UNIQUE,
      provider_name text NOT NULL,
      language text NOT NULL DEFAULT 'en',
      category text NOT NULL DEFAULT 'MARKETING',
      purpose text NOT NULL DEFAULT 'intro',      -- intro | follow_up_1 | follow_up_2
      variable_count integer NOT NULL DEFAULT 1,
      is_active boolean NOT NULL DEFAULT false,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )`);

  // outreach_activities WhatsApp columns
  const actCols: [string, string][] = [
    ["campaign_id", "text"],
    ["template_name", "text"],
    ["template_language", "text"],
    ["phone_number", "text"],
    ["delivered_at", "timestamptz"],
    ["read_at", "timestamptz"],
  ];
  for (const [col, type] of actCols) await pool.query(`ALTER TABLE outreach_activities ADD COLUMN IF NOT EXISTS ${col} ${type}`);

  // leads mirror fields (spec §2)
  const leadCols: [string, string][] = [
    ["whatsapp_number", "text"],
    ["whatsapp_country_code", "text"],
    ["whatsapp_opt_in_status", "text"],
    ["whatsapp_outreach_status", "text"],
    ["whatsapp_message", "text"],
    ["whatsapp_message_id", "text"],
    ["whatsapp_sent_at", "timestamptz"],
    ["whatsapp_delivered_at", "timestamptz"],
    ["whatsapp_read_at", "timestamptz"],
    ["whatsapp_replied_at", "timestamptz"],
    ["whatsapp_follow_up_date", "timestamptz"],
    ["whatsapp_last_activity", "timestamptz"],
    ["whatsapp_error", "text"],
    ["whatsapp_opt_out_at", "timestamptz"],
  ];
  for (const [col, type] of leadCols) await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ${col} ${type}`);

  // seed template registry (inactive until the operator enables + approves in Meta)
  const seeds = [
    { name: "Vyravo Intro (1 var)", provider_name: "vyravo_wa_intro_v1", language: "en", category: "MARKETING", purpose: "intro", variable_count: 1 },
    { name: "Vyravo Follow-up 1 (1 var)", provider_name: "vyravo_wa_fu1_v1", language: "en", category: "MARKETING", purpose: "follow_up_1", variable_count: 1 },
    { name: "Vyravo Follow-up 2 (1 var)", provider_name: "vyravo_wa_fu2_v1", language: "en", category: "MARKETING", purpose: "follow_up_2", variable_count: 1 },
  ];
  for (const s of seeds) {
    await pool.query(
      `INSERT INTO whatsapp_templates (name, provider_name, language, category, purpose, variable_count, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, false)
       ON CONFLICT (name) DO NOTHING`,
      [s.name, s.provider_name, s.language, s.category, s.purpose, s.variable_count]
    );
  }
}

async function templateFor(purpose: string): Promise<{ name: string; provider_name: string; language: string } | null> {
  const r = await pool.query(
    `SELECT name, provider_name, language FROM whatsapp_templates WHERE purpose = $1 AND is_active = true ORDER BY id DESC LIMIT 1`,
    [purpose]
  );
  return (r.rowCount ?? 0) > 0 ? r.rows[0] : null;
}

// ---------------------------------------------------------------------------
// ELIGIBILITY — phone format + opt-in gate + channel coordination
// ---------------------------------------------------------------------------
export interface WaEligibility {
  lead: any;
  normalized?: { number: string; country_code: string };
  eligible: boolean;
  reason?: string;
}

export async function discoverEligibleLeads(cfg: WhatsAppConfig): Promise<WaEligibility[]> {
  await ensureWhatsAppSchema();
  const r = await pool.query(
    `SELECT l.* FROM leads l
     WHERE COALESCE(l.status, 'active') NOT IN (${BLOCKED_LEAD_STATUSES.map((_, i) => `$${i + 1}`).join(",")})
       AND l.converted_to_client_id IS NULL
     ORDER BY COALESCE(l.lead_score, 0) DESC, l.id DESC
     LIMIT 400`,
    [...BLOCKED_LEAD_STATUSES]
  );

  const out: WaEligibility[] = [];
  for (const lead of r.rows) {
    if (lead.whatsapp_opt_in_status === "opted_out") {
      out.push({ lead, eligible: false, reason: "lead opted out of WhatsApp" });
      continue;
    }
    const existing = await pool.query(
      `SELECT 1 FROM outreach_activities WHERE channel = 'whatsapp' AND lead_id = $1 LIMIT 1`, [lead.id]);
    if ((existing.rowCount ?? 0) > 0) {
      out.push({ lead, eligible: false, reason: "already has a WhatsApp outreach record" });
      continue;
    }
    const norm = normalizeWhatsAppPhone(lead.phone, lead.country);
    if (!norm.valid) {
      out.push({ lead, eligible: false, reason: `invalid phone: ${norm.reason || "unusable number"}` });
      continue;
    }
    if (cfg.require_opt_in && lead.whatsapp_opt_in_status !== "opted_in") {
      out.push({ lead, eligible: false, reason: "no WhatsApp opt-in on record (mark the lead as Opted In first)" });
      continue;
    }
    if ((lead.lead_score ?? 0) < cfg.min_score) {
      out.push({ lead, eligible: false, reason: `below minimum score (${cfg.min_score})` });
      continue;
    }
    // multi-channel coordination: don't blast a lead that got an email intro recently
    const recent = await pool.query(
      `SELECT 1 FROM outreach_events e
       WHERE e.lead_id = $1 AND e.status = 'sent' AND e.sent_at > now() - interval '14 days'
       UNION ALL
       SELECT 1 FROM email_queue q
       WHERE q.lead_id = $1 AND q.email_type = 'outreach' AND q.status = 'pending' AND q.created_at > now() - interval '14 days'
       LIMIT 1`, [lead.id]);
    if ((recent.rowCount ?? 0) > 0) {
      out.push({ lead, eligible: false, reason: "recently contacted via email outreach (channel cooldown)" });
      continue;
    }
    out.push({ lead, eligible: true, normalized: { number: norm.number, country_code: norm.country_code } });
  }
  return out;
}

// ---------------------------------------------------------------------------
// GENERATION
// ---------------------------------------------------------------------------
export async function generateToday(cfg: WhatsAppConfig): Promise<{ generated: number; notEligible: number; reasons: Record<string, number> }> {
  await ensureWhatsAppSchema();
  const found = await discoverEligibleLeads(cfg);
  let generated = 0, notEligible = 0;
  const reasons: Record<string, number> = {};

  for (const { lead, eligible, reason, normalized } of found) {
    if (!eligible) {
      notEligible++;
      if (reason) reasons[reason] = (reasons[reason] || 0) + 1;
      await pool.query(
        `UPDATE leads SET whatsapp_outreach_status = 'not_eligible', whatsapp_error = $2, whatsapp_last_activity = now(), updated_at = now() WHERE id = $1`,
        [lead.id, reason || null]
      );
      continue;
    }
    let gen: WhatsAppGenResult;
    try {
      gen = await generateWhatsAppMessage(lead, 0);
    } catch (e: any) {
      console.error("WhatsApp generation failed for lead", lead.id, e?.message);
      await pool.query(
        `UPDATE leads SET whatsapp_outreach_status = 'failed', whatsapp_error = $2, whatsapp_last_activity = now(), updated_at = now() WHERE id = $1`,
        [lead.id, String(e?.message || "generation error").slice(0, 300)]
      );
      continue;
    }
    const tf = await templateFor("intro");
    const ins = await pool.query(
      `INSERT INTO outreach_activities (lead_id, channel, follow_up_number, message, status, personalization_summary, personalization_data,
        framework, ai_generated, campaign_id, template_name, template_language, phone_number, scheduled_at, updated_at)
       VALUES ($1, 'whatsapp', 0, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())
       ON CONFLICT (lead_id, channel, follow_up_number) DO NOTHING
       RETURNING id`,
      [lead.id, gen.message,
       cfg.approval_required ? "awaiting_approval" : "queued",
       gen.summary,
       JSON.stringify({ framework: gen.framework, ai: gen.ai, score: lead.lead_score ?? 0, mask: maskWhatsAppNumber(normalized!.number) }),
       gen.framework, gen.ai, cfg.campaign_id,
       tf?.provider_name || null, tf?.language || "en", normalized!.number]
    );
    if ((ins.rowCount ?? 0) === 0) continue;
    await pool.query(
      `UPDATE leads SET whatsapp_number = $2, whatsapp_country_code = $3, whatsapp_opt_in_status = COALESCE(whatsapp_opt_in_status, 'opted_in'),
              whatsapp_outreach_status = $4, whatsapp_message = $5,
              whatsapp_last_activity = now(), whatsapp_error = NULL, updated_at = now()
       WHERE id = $1`,
      [lead.id, normalized!.number, normalized!.country_code,
       cfg.approval_required ? "awaiting_approval" : "approved", gen.message]
    );
    generated++;
  }
  return { generated, notEligible, reasons };
}

// ---------------------------------------------------------------------------
// APPROVAL WORKFLOW
// ---------------------------------------------------------------------------
export async function approveActivity(id: number): Promise<{ ok: boolean; error?: string }> {
  const r = await pool.query(
    `UPDATE outreach_activities SET status = 'approved', approved_at = now(), updated_at = now()
     WHERE id = $1 AND channel = 'whatsapp' AND status = 'awaiting_approval' RETURNING lead_id`, [id]);
  if ((r.rowCount ?? 0) === 0) return { ok: false, error: "Not found or not awaiting approval (refresh)." };
  await queueActivity(id, true);
  await pool.query(`UPDATE leads SET whatsapp_outreach_status = 'approved', updated_at = now() WHERE id = $1`, [r.rows[0].lead_id]);
  return { ok: true };
}

export async function queueActivity(id: number, alreadyApproved = false): Promise<{ ok: boolean; error?: string }> {
  const r = await pool.query(
    `UPDATE outreach_activities SET status = 'queued', queued_at = now(), scheduled_at = now(), updated_at = now()
     WHERE id = $1 AND channel = 'whatsapp' AND status IN ($2) RETURNING lead_id`,
    [id, alreadyApproved ? "approved" : "awaiting_approval"]);
  if ((r.rowCount ?? 0) === 0) return { ok: false, error: "Cannot queue this item (wrong status)." };
  await pool.query(`UPDATE leads SET whatsapp_outreach_status = 'queued', updated_at = now() WHERE id = $1`, [r.rows[0].lead_id]);
  return { ok: true };
}

export async function editMessage(id: number, message: string): Promise<{ ok: boolean; error?: string }> {
  const clean = String(message || "").trim();
  if (clean.length < 8 || clean.length > 500) return { ok: false, error: "Message must be 8–500 characters." };
  const r = await pool.query(
    `UPDATE outreach_activities SET message = $2, updated_at = now()
     WHERE id = $1 AND channel = 'whatsapp' AND status IN ('awaiting_approval','approved','queued','failed') RETURNING lead_id`, [id, clean]);
  if ((r.rowCount ?? 0) === 0) return { ok: false, error: "Only pending/failed messages can be edited." };
  await pool.query(`UPDATE leads SET whatsapp_message = $2, whatsapp_outreach_status = 'awaiting_approval', updated_at = now() WHERE id = $1`, [r.rows[0].lead_id, clean]);
  return { ok: true };
}

export async function regenerateMessage(id: number): Promise<{ ok: boolean; message?: string; error?: string }> {
  const r = await pool.query(
    `SELECT a.*, l.* FROM outreach_activities a JOIN leads l ON l.id = a.lead_id WHERE a.id = $1 AND a.channel = 'whatsapp' LIMIT 1`, [id]);
  if ((r.rowCount ?? 0) === 0) return { ok: false, error: "Not found." };
  const row = r.rows[0];
  const gen = await generateWhatsAppMessage(row, Number(row.follow_up_number || 0), { attempt: 4 });
  const u = await pool.query(
    `UPDATE outreach_activities SET message = $2, personalization_summary = $3, framework = $4, ai_generated = $5,
            status = CASE WHEN status IN ('failed','queued') THEN 'awaiting_approval' ELSE status END,
            error = NULL, updated_at = now()
     WHERE id = $1 RETURNING lead_id`, [id, gen.message, gen.summary, gen.framework, gen.ai]);
  await pool.query(`UPDATE leads SET whatsapp_message = $2, whatsapp_outreach_status = 'awaiting_approval', whatsapp_error = NULL, updated_at = now() WHERE id = $1`, [u.rows[0].lead_id, gen.message]);
  return { ok: true, message: gen.message };
}

export async function skipActivity(id: number): Promise<{ ok: boolean; error?: string }> {
  const r = await pool.query(
    `UPDATE outreach_activities SET status = 'skipped', updated_at = now()
     WHERE id = $1 AND channel = 'whatsapp' AND status NOT IN ('sent','delivered','read','replied','completed') RETURNING lead_id`, [id]);
  if ((r.rowCount ?? 0) === 0) return { ok: false, error: "Cannot skip a sent/replied message." };
  await pool.query(`UPDATE leads SET whatsapp_outreach_status = 'skipped', updated_at = now() WHERE id = $1`, [r.rows[0].lead_id]);
  return { ok: true };
}

export async function retryActivity(id: number): Promise<{ ok: boolean; error?: string }> {
  const r = await pool.query(
    `UPDATE outreach_activities SET status = 'queued', queued_at = now(), error = NULL, updated_at = now()
     WHERE id = $1 AND channel = 'whatsapp' AND status = 'failed' RETURNING lead_id`, [id]);
  if ((r.rowCount ?? 0) === 0) return { ok: false, error: "Only failed messages can be retried." };
  await pool.query(`UPDATE leads SET whatsapp_outreach_status = 'queued', whatsapp_error = NULL, updated_at = now() WHERE id = $1`, [r.rows[0].lead_id]);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// SENDING — official Cloud API only; template-mandatory; capped; stop-aware
// ---------------------------------------------------------------------------
async function sentToday(): Promise<number> {
  return Number((await pool.query(`SELECT count(*)::int n FROM whatsapp_send_log WHERE sent_at::date = CURRENT_DATE`)).rows[0].n);
}

export interface WaSendResult {
  sent: number; queued: number; failed: number; capped: boolean;
  stopped: boolean; simulated: boolean; configured: boolean; mode: string; detail: string[];
}

export async function sendBatch(cfg: WhatsAppConfig, opts: { simulate?: boolean } = {}): Promise<WaSendResult> {
  await ensureWhatsAppSchema();
  const detail: string[] = [];
  const simulate = Boolean(opts.simulate) || cfg.test_mode;

  if (!simulate && cfg.emergency_stop) {
    return { sent: 0, queued: 0, failed: 0, capped: false, stopped: true, simulated: false, configured: true, mode: "stopped", detail: ["EMERGENCY STOP active — no WhatsApp messages were sent"] };
  }
  if (!simulate && !cfg.enabled) {
    return { sent: 0, queued: 0, failed: 0, capped: false, stopped: false, simulated: false, configured: true, mode: "disabled", detail: ["WhatsApp sending is OFF — enable it in settings to send"] };
  }
  const configured = isWhatsConfigured();
  if (!simulate && !configured) {
    return { sent: 0, queued: 0, failed: 0, capped: false, stopped: false, simulated: false, configured: false, mode: "unconfigured", detail: ["Meta WhatsApp API not configured (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID missing) — no messages sent"] };
  }

  const today = simulate ? 0 : await sentToday();
  const remaining = Math.max(0, cfg.daily_limit - today);
  const cap = Math.min(remaining, cfg.max_per_run);
  if (cap <= 0) {
    return { sent: 0, queued: 0, failed: 0, capped: true, stopped: false, simulated: simulate, configured, mode: "capped", detail: [`Daily limit reached (${today}/${cfg.daily_limit})`] };
  }

  const rows = await pool.query(
    `SELECT a.*, l.phone, l.status AS lead_status, l.converted_to_client_id, l.full_name, l.business_name
     FROM outreach_activities a
     JOIN leads l ON l.id = a.lead_id
     WHERE a.channel = 'whatsapp' AND a.status = 'queued'
       AND COALESCE(l.status,'active') NOT IN (${BLOCKED_LEAD_STATUSES.map((_, i) => `$${i + 1}`).join(",")})
       AND l.converted_to_client_id IS NULL
       AND l.whatsapp_opt_in_status IS DISTINCT FROM 'opted_out'
       AND a.phone_number IS NOT NULL AND a.phone_number <> ''
     ORDER BY a.queued_at ASC NULLS FIRST, a.id ASC
     LIMIT $${BLOCKED_LEAD_STATUSES.length + 1}`,
    [...BLOCKED_LEAD_STATUSES, cap]
  );

  let sent = 0, queued = 0, failed = 0, lastSent = 0;
  for (const row of rows.rows) {
    if (!simulate && sent >= remaining) break;
    if (!simulate && sent + failed >= cap) break;
    if (!simulate && sent + failed > 0 && cfg.min_delay_min > 0) {
      const wait = cfg.min_delay_min * 60_000 - (Date.now() - lastSent);
      if (wait > 0) await new Promise((r) => setTimeout(r, Math.min(wait, 60_000)));
    }
    const fresh = await pool.query(`SELECT status FROM outreach_activities WHERE id = $1`, [row.id]);
    if ((fresh.rowCount ?? 0) === 0 || fresh.rows[0].status !== "queued") { queued++; continue; }

    const to = String(row.phone_number || "");
    if (!isValidWhatsAppNumber(to)) {
      await pool.query(`UPDATE outreach_activities SET status = 'failed', error = 'Blocked \u2014 invalid recipient number', updated_at = now() WHERE id = $1`, [row.id]);
      failed++;
      continue;
    }
    // template gate (§10): business-initiated WhatsApp requires an approved template
    const purpose = row.follow_up_number === 0 ? "intro" : row.follow_up_number === 1 ? "follow_up_1" : "follow_up_2";
    const tf = await templateFor(purpose);
    if (!tf) {
      if (simulate) {
        queued++; // dry-run: never poison the row; surface the policy gap in results
        detail.push(`#sim ${row.id} would be BLOCKED (no approved template for ${purpose})`);
      } else {
        await pool.query(
          `UPDATE outreach_activities SET status = 'failed',
                  error = 'Blocked \u2014 WhatsApp Policy/Eligibility: no approved template for this message', updated_at = now() WHERE id = $1`, [row.id]);
        failed++;
        detail.push(`blocked #${row.id}: no approved template for ${purpose}`);
      }
      continue;
    }
    const result = await sendTemplateMessage(to, tf.provider_name, tf.language, { "{body}": row.message }, { simulate });
    if (result.ok) {
      if (simulate) {
        queued++;
        detail.push(`#sim ${row.id} would send to ${maskWhatsAppNumber(to)}`);
      } else {
        await pool.query(
          `UPDATE outreach_activities SET status = 'sent', sent_at = now(), provider_message_id = $2, template_name = $3,
                  template_language = $4, error = NULL, follow_up_date = now() + ($5 || ' days')::interval, updated_at = now() WHERE id = $1`,
          [row.id, result.id || null, tf.provider_name, tf.language, cfg.follow_up_days[0] ?? 3]);
        await pool.query(`INSERT INTO whatsapp_send_log (activity_id) VALUES ($1)`, [row.id]);
        await pool.query(
          `UPDATE leads SET whatsapp_outreach_status = 'sent', whatsapp_message = $2, whatsapp_message_id = $3,
                  whatsapp_sent_at = now(), whatsapp_follow_up_date = now() + ($4 || ' days')::interval,
                  whatsapp_last_activity = now(), whatsapp_error = NULL, last_contacted_at = now(), updated_at = now()
           WHERE id = $1`,
          [row.lead_id, row.message, result.id || null, cfg.follow_up_days[0] ?? 3]);
        sent++;
        lastSent = Date.now();
        detail.push(`sent #${row.id} \u2192 ${maskWhatsAppNumber(to)} (${result.id?.slice(0, 24)}…)`);
      }
    } else {
      const err = String(result.error || "send failed");
      await pool.query(
        `UPDATE outreach_activities SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`,
        [row.id, err.slice(0, 500)]);
      await pool.query(`UPDATE leads SET whatsapp_outreach_status = 'failed', whatsapp_error = $2, updated_at = now() WHERE id = $1`,
        [row.lead_id, err.slice(0, 500)]);
      failed++;
      detail.push(`failed #${row.id}: ${err.slice(0, 120)}`);
    }
  }
  return { sent, queued, failed, capped: sent + failed >= cap, stopped: false, simulated: simulate, configured, mode: "official", detail: detail.slice(0, 20) };
}

// ---------------------------------------------------------------------------
// MANUAL OPERATIONS
// ---------------------------------------------------------------------------
export async function markSent(id: number): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getWhatsAppConfig();
  const r = await pool.query(
    `UPDATE outreach_activities SET status = 'sent', sent_at = COALESCE(sent_at, now()), provider_message_id = COALESCE(provider_message_id, 'manual'), error = NULL,
            follow_up_date = now() + ($2 || ' days')::interval, updated_at = now()
     WHERE id = $1 AND channel = 'whatsapp' AND status = 'queued' RETURNING lead_id`, [id, cfg.follow_up_days[0] ?? 3]);
  if ((r.rowCount ?? 0) === 0) return { ok: false, error: "Only queued messages can be marked sent." };
  await pool.query(
    `UPDATE leads SET whatsapp_outreach_status = 'sent', whatsapp_sent_at = now(), whatsapp_follow_up_date = now() + ($2 || ' days')::interval,
            whatsapp_last_activity = now(), updated_at = now() WHERE id = $1`, [r.rows[0].lead_id, cfg.follow_up_days[0] ?? 3]);
  return { ok: true };
}

export async function markDelivered(id: number): Promise<{ ok: boolean; error?: string }> {
  const r = await pool.query(
    `UPDATE outreach_activities SET status = 'delivered', delivered_at = COALESCE(delivered_at, now()), updated_at = now()
     WHERE id = $1 AND channel = 'whatsapp' AND status IN ('sent','queued') RETURNING lead_id`, [id]);
  if ((r.rowCount ?? 0) === 0) return { ok: false, error: "Only sent messages can be marked delivered." };
  await pool.query(`UPDATE leads SET whatsapp_outreach_status = 'delivered', whatsapp_delivered_at = now(), whatsapp_last_activity = now(), updated_at = now() WHERE id = $1`, [r.rows[0].lead_id]);
  return { ok: true };
}

export async function markRead(id: number): Promise<{ ok: boolean; error?: string }> {
  const r = await pool.query(
    `UPDATE outreach_activities SET status = 'read', read_at = COALESCE(read_at, now()), updated_at = now()
     WHERE id = $1 AND channel = 'whatsapp' AND status IN ('sent','delivered','queued') RETURNING lead_id`, [id]);
  if ((r.rowCount ?? 0) === 0) return { ok: false, error: "Only sent/delivered messages can be marked read." };
  await pool.query(`UPDATE leads SET whatsapp_outreach_status = 'read', whatsapp_read_at = now(), whatsapp_last_activity = now(), updated_at = now() WHERE id = $1`, [r.rows[0].lead_id]);
  return { ok: true };
}

export async function markReplied(id: number): Promise<{ ok: boolean; error?: string }> {
  const r = await pool.query(
    `UPDATE outreach_activities SET status = 'replied', replied_at = now(), follow_up_date = NULL, updated_at = now()
     WHERE id = $1 AND channel = 'whatsapp' AND status IN ('sent','delivered','read','queued') RETURNING lead_id`, [id]);
  if ((r.rowCount ?? 0) === 0) return { ok: false, error: "Only sent/queued messages can be marked replied." };
  await pool.query(
    `UPDATE leads SET whatsapp_outreach_status = 'replied', whatsapp_replied_at = now(), whatsapp_follow_up_date = NULL,
            whatsapp_last_activity = now(), status = 'replied', updated_at = now() WHERE id = $1`, [r.rows[0].lead_id]);
  return { ok: true };
}

export async function optOutLead(leadId: number, reason = "manual"): Promise<{ ok: boolean; error?: string }> {
  await pool.query(
    `UPDATE leads SET whatsapp_opt_in_status = 'opted_out', whatsapp_outreach_status = 'opted_out', whatsapp_opt_out_at = now(),
            whatsapp_follow_up_date = NULL, whatsapp_last_activity = now(), status = 'do_not_contact', updated_at = now()
     WHERE id = $1`, [leadId]);
  await pool.query(
    `UPDATE outreach_activities SET follow_up_date = NULL,
            status = CASE WHEN status IN ('queued','awaiting_approval','approved') THEN 'skipped' ELSE status END, updated_at = now()
     WHERE lead_id = $1 AND channel = 'whatsapp' AND status NOT IN ('replied','completed')`, [leadId]);
  return { ok: true };
}

export async function optInLead(leadId: number): Promise<{ ok: boolean; error?: string }> {
  await pool.query(
    `UPDATE leads SET whatsapp_opt_in_status = 'opted_in', whatsapp_opt_out_at = NULL, whatsapp_error = NULL, updated_at = now() WHERE id = $1`, [leadId]);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// FOLLOW-UPS — Day 3 / Day 7 anchored on the intro's sent_at
// ---------------------------------------------------------------------------
export async function scheduleFollowUps(cfg: WhatsAppConfig): Promise<number> {
  await ensureWhatsAppSchema();
  const days = cfg.follow_up_days.length ? cfg.follow_up_days.slice(0, 2) : [3, 7];
  let scheduled = 0;
  for (let n = 0; n < days.length; n++) {
    const prev = n, next = n + 1;
    const rows = await pool.query(
      `SELECT a.*, l.*, i.id AS intro_id FROM outreach_activities a
       JOIN leads l ON l.id = a.lead_id
       JOIN outreach_activities i ON i.lead_id = a.lead_id AND i.channel = 'whatsapp' AND i.follow_up_number = 0
       WHERE a.channel = 'whatsapp' AND a.follow_up_number = $1
         AND a.status = 'sent'
         AND i.sent_at + ($2 || ' days')::interval <= now()
         AND COALESCE(l.status,'active') NOT IN (${BLOCKED_LEAD_STATUSES.map((_, i2) => `$${i2 + 4}`).join(",")})
         AND l.converted_to_client_id IS NULL
         AND l.whatsapp_opt_in_status IS DISTINCT FROM 'opted_out'
         AND NOT EXISTS (SELECT 1 FROM outreach_activities e2
                         WHERE e2.lead_id = a.lead_id AND e2.channel = 'whatsapp' AND e2.follow_up_number = $3)
       LIMIT 100`,
      [prev, days[n], next, ...BLOCKED_LEAD_STATUSES]);
    for (const row of rows.rows) {
      let gen: WhatsAppGenResult;
      try { gen = await generateWhatsAppFollowUp(row, row.message || "", next); }
      catch (e: any) { console.error("whatsapp follow-up generation failed", row.lead_id, e?.message); continue; }
      const tf = await templateFor(next === 1 ? "follow_up_1" : "follow_up_2");
      const ins = await pool.query(
        `INSERT INTO outreach_activities (lead_id, channel, follow_up_number, message, status, personalization_summary, personalization_data,
          framework, ai_generated, campaign_id, template_name, template_language, phone_number, scheduled_at, updated_at)
         VALUES ($1, 'whatsapp', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), now())
         ON CONFLICT (lead_id, channel, follow_up_number) DO NOTHING RETURNING id`,
        [row.lead_id, next, gen.message, cfg.approval_required ? "awaiting_approval" : "queued", gen.summary,
         JSON.stringify({ ai: gen.ai, intro: (row.message || "").slice(0, 80) }), gen.framework, gen.ai, cfg.campaign_id,
         tf?.provider_name || null, tf?.language || "en", row.phone_number]);
      if ((ins.rowCount ?? 0) > 0) {
        scheduled++;
        await pool.query(
          `UPDATE leads SET whatsapp_outreach_status = $2, whatsapp_follow_up_date = (SELECT i2.sent_at + ($3 || ' days')::interval FROM outreach_activities i2 WHERE i2.id = $4), updated_at = now()
           WHERE leads.id = $1`,
          [row.lead_id, cfg.approval_required ? "awaiting_approval" : "queued", days[n], row.intro_id]);
      }
    }
  }
  return scheduled;
}

// ---------------------------------------------------------------------------
// WEBHOOK HANDLERS (called from /api/webhooks/whatsapp)
// ---------------------------------------------------------------------------
export async function applyStatusUpdate(waId: string, status: string, timestamp?: string): Promise<string> {
  const r = await pool.query(
    `SELECT id, lead_id, status FROM outreach_activities WHERE channel = 'whatsapp' AND provider_message_id = $1 LIMIT 1`, [waId]);
  if ((r.rowCount ?? 0) === 0) return "unknown_message";
  const row = r.rows[0];
  const at = timestamp ? new Date(Number(timestamp) * 1000) : new Date();
  if (status === "sent") {
    await pool.query(`UPDATE outreach_activities SET status = 'sent', sent_at = COALESCE(sent_at, $2), updated_at = now() WHERE id = $1`, [row.id, at]);
  } else if (status === "delivered") {
    await pool.query(`UPDATE outreach_activities SET status = 'delivered', delivered_at = $2, updated_at = now() WHERE id = $1`, [row.id, at]);
    await pool.query(`UPDATE leads SET whatsapp_outreach_status = 'delivered', whatsapp_delivered_at = $2, whatsapp_last_activity = now(), updated_at = now() WHERE id = $1`, [row.lead_id, at]);
  } else if (status === "read") {
    await pool.query(`UPDATE outreach_activities SET status = 'read', read_at = $2, updated_at = now() WHERE id = $1`, [row.id, at]);
    await pool.query(`UPDATE leads SET whatsapp_outreach_status = 'read', whatsapp_read_at = $2, whatsapp_last_activity = now(), updated_at = now() WHERE id = $1`, [row.lead_id, at]);
  } else if (status === "failed") {
    const err = row.error || "Meta reported failure";
    await pool.query(`UPDATE outreach_activities SET status = 'failed', error = COALESCE(error, $2), updated_at = now() WHERE id = $1`, [row.id, err]);
    await pool.query(`UPDATE leads SET whatsapp_outreach_status = 'failed', whatsapp_error = $2, updated_at = now() WHERE id = $1`, [row.lead_id, err]);
  }
  return status;
}

/** Incoming reply: match lead by number → replied + stop follow-ups + record. */
export async function applyIncomingMessage(fromNumber: string, body: string, waMessageId?: string, timestamp?: string): Promise<{ handled: boolean; leadId?: number; optedOut?: boolean }> {
  const norm = normalizeWhatsAppPhone(fromNumber);
  if (!norm.valid) {
    const fuzzy = await pool.query(`SELECT id FROM leads WHERE REPLACE(whatsapp_number, ' ', '') LIKE $1 LIMIT 1`, [`%${String(fromNumber).replace(/[^\d]/g, "").slice(-10)}%`]);
    if ((fuzzy.rowCount ?? 0) === 0) return { handled: false };
    return applyIncomingToLead(fuzzy.rows[0].id, fromNumber, body, waMessageId, timestamp);
  }
  const r = await pool.query(`SELECT id FROM leads WHERE whatsapp_number = $1 LIMIT 1`, [norm.number]);
  if ((r.rowCount ?? 0) === 0) return { handled: false };
  return applyIncomingToLead(r.rows[0].id, fromNumber, body, waMessageId, timestamp);
}

async function applyIncomingToLead(leadId: number, fromNumber: string, body: string, waMessageId?: string, timestamp?: string): Promise<{ handled: boolean; leadId: number; optedOut?: boolean }> {
  const at = timestamp ? new Date(Number(timestamp) * 1000) : new Date();
  const act = await pool.query(
    `SELECT id FROM outreach_activities WHERE channel = 'whatsapp' AND lead_id = $1 AND status IN ('sent','delivered','read','queued')
     ORDER BY id DESC LIMIT 1`, [leadId]);
  const activityId = (act.rowCount ?? 0) > 0 ? act.rows[0].id : null;
  await pool.query(
    `INSERT INTO whatsapp_replies (lead_id, activity_id, from_number, body, received_at) VALUES ($1, $2, $3, $4, $5)`,
    [leadId, activityId, fromNumber, String(body).slice(0, 2000), at]);
  await pool.query(
    `UPDATE outreach_activities SET status = 'replied', replied_at = COALESCE(replied_at, $2), follow_up_date = NULL, updated_at = now()
     WHERE channel = 'whatsapp' AND lead_id = $1 AND follow_up_date IS NOT NULL`, [leadId, at]);
  let optedOut = false;
  if (isOptOutMessage(body)) {
    await optOutLead(leadId, "reply keyword");
    optedOut = true;
  } else {
    await pool.query(
      `UPDATE leads SET whatsapp_outreach_status = 'replied', whatsapp_replied_at = COALESCE(whatsapp_replied_at, $2), whatsapp_follow_up_date = NULL,
              whatsapp_last_activity = now(), status = 'replied', updated_at = now() WHERE id = $1`, [leadId, at]);
  }
  return { handled: true, leadId, optedOut };
}

// ---------------------------------------------------------------------------
// ANALYTICS
// ---------------------------------------------------------------------------
export async function getWhatsAppDashboard(filters: { status?: string; today?: boolean } = {}) {
  await ensureWhatsAppSchema();
  const cfg = await getWhatsAppConfig();
  const fu1 = cfg.follow_up_days[0] ?? 3;
  const s = (await pool.query(`
    SELECT
      (SELECT count(*)::int FROM outreach_activities WHERE channel='whatsapp') AS generated,
      (SELECT count(*)::int FROM outreach_activities WHERE channel='whatsapp' AND status='awaiting_approval') AS awaiting,
      (SELECT count(*)::int FROM outreach_activities WHERE channel='whatsapp' AND status='queued') AS queued,
      (SELECT count(*)::int FROM outreach_activities WHERE channel='whatsapp' AND status='sent') AS sent,
      (SELECT count(*)::int FROM outreach_activities WHERE channel='whatsapp' AND status='delivered') AS delivered,
      (SELECT count(*)::int FROM outreach_activities WHERE channel='whatsapp' AND status='read') AS read_count,
      (SELECT count(*)::int FROM outreach_activities WHERE channel='whatsapp' AND status='replied') AS replies,
      (SELECT count(*)::int FROM outreach_activities WHERE channel='whatsapp' AND status='failed') AS failed,
      (SELECT count(*)::int FROM outreach_activities WHERE channel='whatsapp' AND follow_up_number > 0) AS followups_generated,
      (SELECT count(*)::int FROM outreach_activities WHERE channel='whatsapp' AND status='sent' AND sent_at::date = CURRENT_DATE) AS sent_today,
      (SELECT count(*)::int FROM leads WHERE whatsapp_opt_in_status = 'opted_out') AS optouts,
      (SELECT count(*)::int FROM leads WHERE whatsapp_outreach_status IN ('sent','delivered','read','replied') AND converted_to_client_id IS NOT NULL) AS clients,
      (SELECT count(*)::int FROM leads WHERE whatsapp_outreach_status IN ('sent','delivered','read','replied') AND meeting_status = 'booked') AS calls_booked
  `)).rows[0];
  const sentAll = Number(s.sent) + Number(s.delivered) + Number(s.read_count) + Number(s.replies);
  const deliveredAll = Number(s.delivered) + Number(s.read_count) + Number(s.replies);
  const readAll = Number(s.read_count) + Number(s.replies);
  const replyRate = sentAll > 0 ? Math.round((Number(s.replies) / sentAll) * 100) : 0;
  const convRate = sentAll > 0 ? Math.round((Number(s.clients) / sentAll) * 100) : 0;
  const eligibleToday = Number((await pool.query(
    `SELECT count(*)::int n FROM leads WHERE whatsapp_outreach_status IS NOT NULL AND whatsapp_outreach_status <> 'not_eligible' AND created_at::date = CURRENT_DATE`
  )).rows[0].n);

  const where: string[] = [`a.channel = 'whatsapp'`];
  const params: any[] = [];
  if (filters.status === "follow_up_due") {
    where.push(`a.follow_up_number = 0 AND a.status IN ('sent','delivered','read') AND a.sent_at + (${fu1} || ' days')::interval <= now()
                AND NOT EXISTS (SELECT 1 FROM outreach_activities f WHERE f.lead_id = a.lead_id AND f.channel = 'whatsapp' AND f.follow_up_number = 1)`);
  } else if (filters.status) {
    params.push(filters.status); where.push(`a.status = $${params.length}`);
  }
  if (filters.today) where.push(`a.created_at::date = CURRENT_DATE`);
  const list = await pool.query(
    `SELECT a.*, l.full_name, l.business_name, l.industry, l.lead_score, l.phone, l.whatsapp_opt_in_status,
            l.status AS lead_status, l.converted_to_client_id
     FROM outreach_activities a JOIN leads l ON l.id = a.lead_id
     WHERE ${where.join(" AND ")}
     ORDER BY a.created_at DESC, a.id DESC LIMIT 300`, params);

  return {
    stats: {
      leadsProcessedToday: eligibleToday,
      eligible: Number((await pool.query(`SELECT count(*)::int n FROM leads WHERE whatsapp_outreach_status = 'awaiting_approval'`)).rows[0].n) + Number(s.awaiting),
      generated: Number(s.generated),
      awaitingApproval: Number(s.awaiting),
      approved: Number(s.awaiting) + Number(s.queued) + Number((await pool.query(`SELECT count(*)::int n FROM outreach_activities WHERE channel='whatsapp' AND status='approved'`)).rows[0].n),
      queued: Number(s.queued),
      sent: Number(s.sent),
      delivered: Number(s.delivered),
      read: Number(s.read_count),
      replies: Number(s.replies),
      replyRate,
      followupsGenerated: Number(s.followups_generated),
      failed: Number(s.failed),
      optOuts: Number(s.optouts),
      callsBooked: Number(s.calls_booked),
      clients: Number(s.clients),
      conversionRate: convRate,
      sentToday: Number(s.sent_today),
      dailyLimit: cfg.daily_limit,
      deliveredRate: sentAll > 0 ? Math.round((deliveredAll / sentAll) * 100) : 0,
      readRate: sentAll > 0 ? Math.round((readAll / sentAll) * 100) : 0,
    },
    queue: list.rows,
    config: cfg,
    sender: { configured: isWhatsConfigured(), simulated: cfg.test_mode },
  };
}

// ---------------------------------------------------------------------------
// PIPELINE ENTRY (engine hook + manual "generate now")
// ---------------------------------------------------------------------------
export async function runWhatsAppPipeline(opts: { generate?: boolean; send?: boolean; simulate?: boolean } = {}): Promise<any> {
  await ensureWhatsAppSchema();
  const cfg = await getWhatsAppConfig();
  let generated = 0, reasons: Record<string, number> = {}, sendResult: any = null;
  if (opts.generate) {
    const g = await generateToday(cfg);
    generated = g.generated;
    reasons = g.reasons;
  }
  if (opts.send) {
    const fu = await scheduleFollowUps(cfg);
    sendResult = { ...(await sendBatch(cfg, opts)), followupsScheduled: fu };
  }
  const out: any = {
    success: true,
    cfg: { enabled: cfg.enabled, test: cfg.test_mode, approvalRequired: cfg.approval_required, dailyLimit: cfg.daily_limit, stopped: cfg.emergency_stop, configured: isWhatsConfigured() },
    generated,
    reasons,
    sendResult,
  };
  if (opts.send && sendResult) out.followupsScheduled = sendResult.followupsScheduled;
  return out;
}
