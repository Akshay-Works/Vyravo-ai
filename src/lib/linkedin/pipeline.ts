// ============================================================================
// LINKEDIN OUTREACH PIPELINE — daily leads → qualify → personalize → generate
// → Awaiting Approval → Approve & Queue → Send (approved integration) →
// track → follow-up @ day 3 / day 7. Reuses the CRM `leads` table, the admin
// auth, the OpenAI client and the multi-channel outreach_activities model.
//
// SAFETY CONTRACT
// ---------------
// • Nothing is ever sent unless cfg.enabled is ON, emergency_stop is OFF and
//   a real sender is configured (otherwise sends remain queued/manual).
// • The recipient is always the CRM lead's own LinkedIn URL — dynamic, never
//   hardcoded, never the operator's own profile.
// • UNIQUE(lead_id, channel, follow_up_number) prevents duplicate outreach.
// ============================================================================
import { pool } from "@/db";
import { getLinkedInConfig, type LinkedInConfig } from "./config";
import {
  generateLinkedInMessage, generateFollowUpMessage, isValidLinkedInUrl,
  normalizeLinkedInUrl, type GenerationResult,
} from "./generator";
import { sendLinkedInMessage, getSenderMode } from "./sender";

// statuses on the lead row that block LinkedIn outreach entirely
const BLOCKED_LEAD_STATUSES = ["contacted", "replied", "won", "lost", "do_not_contact", "skipped", "completed"];

// ---------------------------------------------------------------------------
// SCHEMA (idempotent — runs on every pipeline call, like the email pipeline)
// ---------------------------------------------------------------------------
export async function ensureLinkedInSchema(): Promise<void> {
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
  await pool.query(`CREATE TABLE IF NOT EXISTS linkedin_config (k text PRIMARY KEY, v text NOT NULL)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS linkedin_send_log (
      id serial PRIMARY KEY,
      activity_id integer NOT NULL REFERENCES outreach_activities(id) ON DELETE CASCADE,
      sent_at timestamptz DEFAULT now()
    )`);

  // CRM mirror fields (spec §1 / §11) — added idempotently to `leads`
  const leadCols: [string, string][] = [
    ["linkedin_url", "text"],
    ["linkedin_status", "text"],
    ["linkedin_message", "text"],
    ["linkedin_sent_at", "timestamptz"],
    ["linkedin_follow_up_date", "timestamptz"],
    ["linkedin_connection_status", "text"],
    ["linkedin_last_activity", "timestamptz"],
    ["linkedin_personalization", "jsonb"],
    ["linkedin_error", "text"],
  ];
  for (const [col, type] of leadCols) {
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ${col} ${type}`);
  }
}

// ---------------------------------------------------------------------------
// DETECTION — leads eligible for a FIRST LinkedIn message
// ---------------------------------------------------------------------------
export interface EligibilityResult {
  lead: any;
  eligible: boolean;
  reason?: string;
}

export async function discoverEligibleLeads(cfg: LinkedInConfig): Promise<EligibilityResult[]> {
  await ensureLinkedInSchema();
  const r = await pool.query(
    `SELECT l.* FROM leads l
     WHERE COALESCE(l.status, 'active') NOT IN (${BLOCKED_LEAD_STATUSES.map((_, i) => `$${i + 1}`).join(",")})
       AND l.converted_to_client_id IS NULL
     ORDER BY COALESCE(l.lead_score, 0) DESC, l.id DESC
     LIMIT 400`,
    [...BLOCKED_LEAD_STATUSES]
  );

  const results: EligibilityResult[] = [];
  for (const lead of r.rows) {
    // has an existing LinkedIn activity (any follow-up number) → already processed
    const existing = await pool.query(
      `SELECT follow_up_number, status FROM outreach_activities WHERE channel = 'linkedin' AND lead_id = $1 LIMIT 1`,
      [lead.id]
    );
    if ((existing.rowCount ?? 0) > 0) {
      results.push({ lead, eligible: false, reason: "already has a LinkedIn outreach record" });
      continue;
    }
    const url = String(lead.linkedin_url || "").trim();
    if (!url) {
      results.push({ lead, eligible: false, reason: "no LinkedIn profile URL on file" });
      continue;
    }
    if (!isValidLinkedInUrl(url)) {
      results.push({ lead, eligible: false, reason: "invalid LinkedIn profile URL" });
      continue;
    }
    if ((lead.lead_score ?? 0) < cfg.min_score) {
      results.push({ lead, eligible: false, reason: `below minimum score (${cfg.min_score})` });
      continue;
    }
    // contacted recently through another channel (email outreach) → cool off
    const recent = await pool.query(
      `SELECT 1 FROM outreach_events e
       WHERE e.lead_id = $1 AND e.status = 'sent' AND e.sent_at > now() - interval '14 days'
       UNION ALL
       SELECT 1 FROM email_queue q
       WHERE q.lead_id = $1 AND q.email_type = 'outreach' AND q.status = 'pending' AND q.created_at > now() - interval '14 days'
       LIMIT 1`,
      [lead.id]
    );
    if ((recent.rowCount ?? 0) > 0) {
      results.push({ lead, eligible: false, reason: "recently contacted via email outreach" });
      continue;
    }
    results.push({ lead, eligible: true });
  }
  return results;
}

// ---------------------------------------------------------------------------
// GENERATION — one unique personalized message per eligible lead → queue
// ---------------------------------------------------------------------------
export async function generateToday(cfg: LinkedInConfig): Promise<{ generated: number; notEligible: number; reasons: Record<string, number> }> {
  await ensureLinkedInSchema();
  const found = await discoverEligibleLeads(cfg);
  let generated = 0;
  let notEligible = 0;
  const reasons: Record<string, number> = {};

  for (const { lead, eligible, reason } of found) {
    if (!eligible) {
      notEligible++;
      if (reason) reasons[reason] = (reasons[reason] || 0) + 1;
      // still surface the reason on the CRM record
      await pool.query(
        `UPDATE leads SET linkedin_status = 'not_eligible', linkedin_error = $2, linkedin_last_activity = now(), updated_at = now() WHERE id = $1`,
        [lead.id, reason || null]
      );
      continue;
    }
    let gen: GenerationResult;
    try {
      gen = await generateLinkedInMessage(lead, 0);
    } catch (e: any) {
      console.error("LinkedIn generation failed for lead", lead.id, e?.message);
      await pool.query(
        `UPDATE leads SET linkedin_status = 'failed', linkedin_error = $2, linkedin_last_activity = now(), updated_at = now() WHERE id = $1`,
        [lead.id, String(e?.message || "generation error").slice(0, 300)]
      );
      continue;
    }
    const ins = await pool.query(
      `INSERT INTO outreach_activities (lead_id, channel, follow_up_number, message, status, personalization_summary, personalization_data, framework, ai_generated, scheduled_at, updated_at)
       VALUES ($1, 'linkedin', 0, $2, $3, $4, $5, $6, $7, now(), now())
       ON CONFLICT (lead_id, channel, follow_up_number) DO NOTHING
       RETURNING id`,
      [
        lead.id, gen.message,
        cfg.approval_required ? "awaiting_approval" : "queued",
        gen.summary,
        JSON.stringify({ framework: gen.framework, ai: gen.ai, score: lead.lead_score ?? 0 }),
        gen.framework, gen.ai,
      ]
    );
    if ((ins.rowCount ?? 0) === 0) continue; // duplicate-safe
    await pool.query(
      `UPDATE leads SET linkedin_status = $2, linkedin_message = $3, linkedin_personalization = $4,
              linkedin_last_activity = now(), linkedin_follow_up_date = NULL, linkedin_error = NULL, updated_at = now()
       WHERE id = $1`,
      [lead.id, cfg.approval_required ? "awaiting_approval" : "approved", gen.message, JSON.stringify({ framework: gen.framework, ai: gen.ai, summary: gen.summary })]
    );
    generated++;
  }
  return { generated, notEligible, reasons };
}

// ---------------------------------------------------------------------------
// APPROVAL WORKFLOW — nothing is ever queued for sending without approval
// ---------------------------------------------------------------------------
export async function approveActivity(id: number): Promise<{ ok: boolean; error?: string }> {
  const r = await pool.query(
    `UPDATE outreach_activities
     SET status = 'approved', approved_at = now(), updated_at = now()
     WHERE id = $1 AND channel = 'linkedin' AND status = 'awaiting_approval'
     RETURNING lead_id`,
    [id]
  );
  if ((r.rowCount ?? 0) === 0) return { ok: false, error: "Not found or not awaiting approval (refresh the list)." };
  await queueActivity(id, true); // Approved → Queued (approval requirement honoured)
  await pool.query(
    `UPDATE leads SET linkedin_status = 'approved', updated_at = now() WHERE id = $1`,
    [r.rows[0].lead_id]
  );
  return { ok: true };
}

export async function queueActivity(id: number, alreadyApproved = false): Promise<{ ok: boolean; error?: string }> {
  const r = await pool.query(
    `UPDATE outreach_activities
     SET status = 'queued', queued_at = now(), scheduled_at = now(), updated_at = now()
     WHERE id = $1 AND channel = 'linkedin' AND status IN ($2)
     RETURNING lead_id`,
    [id, alreadyApproved ? "approved" : "awaiting_approval"]
  );
  if ((r.rowCount ?? 0) === 0) return { ok: false, error: "Cannot queue this item (wrong status)." };
  await pool.query(`UPDATE leads SET linkedin_status = 'queued', updated_at = now() WHERE id = $1`, [r.rows[0].lead_id]);
  return { ok: true };
}

export async function editMessage(id: number, message: string): Promise<{ ok: boolean; error?: string }> {
  const clean = String(message || "").trim();
  if (clean.length < 10 || clean.length > 500) return { ok: false, error: "Message must be 10\u2013500 characters." };
  const r = await pool.query(
    `UPDATE outreach_activities SET message = $2, updated_at = now()
     WHERE id = $1 AND channel = 'linkedin' AND status IN ('awaiting_approval','approved','queued','failed')
     RETURNING lead_id`,
    [id, clean]
  );
  if ((r.rowCount ?? 0) === 0) return { ok: false, error: "Only pending/failed messages can be edited." };
  await pool.query(`UPDATE leads SET linkedin_message = $2, linkedin_status = 'awaiting_approval', updated_at = now() WHERE id = $1`, [r.rows[0].lead_id, clean]);
  return { ok: true };
}

export async function regenerateMessage(id: number): Promise<{ ok: boolean; message?: string; error?: string }> {
  const r = await pool.query(
    `SELECT a.*, l.* FROM outreach_activities a JOIN leads l ON l.id = a.lead_id
     WHERE a.id = $1 AND a.channel = 'linkedin' LIMIT 1`,
    [id]
  );
  if ((r.rowCount ?? 0) === 0) return { ok: false, error: "Not found." };
  const row = r.rows[0];
  const gen = await generateLinkedInMessage(row, Number(row.follow_up_number || 0), { attempt: 4 });
  const u = await pool.query(
    `UPDATE outreach_activities SET message = $2, personalization_summary = $3, framework = $4, ai_generated = $5,
            status = CASE WHEN status IN ('failed','queued') THEN 'awaiting_approval' ELSE status END,
            error = NULL, updated_at = now()
     WHERE id = $1 RETURNING lead_id`,
    [id, gen.message, gen.summary, gen.framework, gen.ai]
  );
  await pool.query(`UPDATE leads SET linkedin_message = $2, linkedin_status = 'awaiting_approval', linkedin_error = NULL, updated_at = now() WHERE id = $1`, [u.rows[0].lead_id, gen.message]);
  return { ok: true, message: gen.message };
}

export async function skipActivity(id: number): Promise<{ ok: boolean; error?: string }> {
  const r = await pool.query(
    `UPDATE outreach_activities SET status = 'skipped', updated_at = now()
     WHERE id = $1 AND channel = 'linkedin' AND status NOT IN ('sent','replied','completed') RETURNING lead_id`,
    [id]
  );
  if ((r.rowCount ?? 0) === 0) return { ok: false, error: "Cannot skip a sent/replied message." };
  await pool.query(`UPDATE leads SET linkedin_status = 'skipped', updated_at = now() WHERE id = $1`, [r.rows[0].lead_id]);
  return { ok: true };
}

export async function retryActivity(id: number): Promise<{ ok: boolean; error?: string }> {
  const r = await pool.query(
    `UPDATE outreach_activities SET status = 'queued', queued_at = now(), error = NULL, updated_at = now()
     WHERE id = $1 AND channel = 'linkedin' AND status = 'failed' RETURNING lead_id`,
    [id]
  );
  if ((r.rowCount ?? 0) === 0) return { ok: false, error: "Only failed messages can be retried." };
  await pool.query(`UPDATE leads SET linkedin_status = 'queued', linkedin_error = NULL, updated_at = now() WHERE id = $1`, [r.rows[0].lead_id]);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// SENDING — rate-limited, capped, emergency-stop aware, never by default
// ---------------------------------------------------------------------------
function sentTodayCount(): Promise<number> {
  return pool.query(`SELECT count(*)::int n FROM linkedin_send_log WHERE sent_at::date = CURRENT_DATE`)
    .then((r) => Number(r.rows[0].n));
}

export interface SendBatchResult {
  sent: number;
  queued: number;    // stayed queued (manual mode / no sender)
  failed: number;
  capped: boolean;
  stopped: boolean;
  simulated: boolean;
  mode: string;
  detail: string[];
}

export async function sendBatch(cfg: LinkedInConfig, opts: { simulate?: boolean } = {}): Promise<SendBatchResult> {
  await ensureLinkedInSchema();
  const detail: string[] = [];
  const simulate = Boolean(opts.simulate) || cfg.test_mode;

  if (!simulate && cfg.emergency_stop) {
    return { sent: 0, queued: 0, failed: 0, capped: false, stopped: true, simulated: false, mode: "stopped", detail: ["EMERGENCY STOP active \u2014 no messages were sent"] };
  }
  if (!simulate && !cfg.enabled) {
    return { sent: 0, queued: 0, failed: 0, capped: false, stopped: false, simulated: false, mode: "disabled", detail: ["LinkedIn sending is OFF \u2014 enable it in settings to send"] };
  }

  const mode = simulate ? "simulated" : getSenderMode();
  const sentToday = simulate ? 0 : await sentTodayCount();
  const remaining = Math.max(0, cfg.daily_limit - sentToday);
  const cap = Math.min(remaining, cfg.max_per_run);
  if (cap <= 0) {
    return { sent: 0, queued: 0, failed: 0, capped: true, stopped: false, simulated: simulate, mode, detail: [`Daily limit reached (${sentToday}/${cfg.daily_limit})`] };
  }

  const rows = await pool.query(
    `SELECT a.*, l.linkedin_url, l.status AS lead_status, l.converted_to_client_id, l.full_name, l.business_name
     FROM outreach_activities a
     JOIN leads l ON l.id = a.lead_id
     WHERE a.channel = 'linkedin' AND a.status = 'queued'
       AND COALESCE(l.status,'active') NOT IN (${BLOCKED_LEAD_STATUSES.map((_, i) => `$${i + 1}`).join(",")})
       AND l.converted_to_client_id IS NULL
       AND l.linkedin_url IS NOT NULL AND TRIM(l.linkedin_url) <> ''
     ORDER BY a.queued_at ASC NULLS FIRST, a.id ASC
     LIMIT $${BLOCKED_LEAD_STATUSES.length + 1}`,
    [...BLOCKED_LEAD_STATUSES, cap]
  );

  let sent = 0, queued = 0, failed = 0;
  let lastSent = 0;

  for (const row of rows.rows) {
    if (!simulate && sent >= remaining) break;
    if (!simulate && sent + failed >= cap) break;

    // minimum delay between sends
    if (!simulate && sent + failed > 0 && cfg.min_delay_min > 0) {
      const wait = cfg.min_delay_min * 60_000 - (Date.now() - lastSent);
      if (wait > 0) await new Promise((r) => setTimeout(r, Math.min(wait, 60_000)));
    }

    const profileUrl = normalizeLinkedInUrl(String(row.linkedin_url));
    if (!profileUrl) {
      await pool.query(`UPDATE outreach_activities SET status = 'failed', error = 'missing LinkedIn profile URL', updated_at = now() WHERE id = $1`, [row.id]);
      failed++;
      continue;
    }

    // send-time duplicate protection: only still-queued rows may be sent
    const fresh = await pool.query(`SELECT status FROM outreach_activities WHERE id = $1`, [row.id]);
    if ((fresh.rowCount ?? 0) === 0 || fresh.rows[0].status !== "queued") { queued++; continue; }

    const result = await sendLinkedInMessage({ profileUrl, message: row.message, leadId: Number(row.lead_id) }, { simulate });
    if (result.ok) {
      if (simulate) {
        queued++; // simulated \u2014 the real send is still pending
        detail.push(`#sim ${row.id} would send to ${profileUrl}`);
      } else {
        await pool.query(
          `UPDATE outreach_activities SET status = 'sent', sent_at = now(), provider_message_id = $2, error = NULL, follow_up_date = now() + ($3 || ' days')::interval, updated_at = now() WHERE id = $1`,
          [row.id, result.id || null, (cfg.follow_up_days[0] ?? 3)]
        );
        await pool.query(`INSERT INTO linkedin_send_log (activity_id) VALUES ($1)`, [row.id]);
        await pool.query(
          `UPDATE leads SET linkedin_status = 'sent', linkedin_message = $2, linkedin_sent_at = now(),
                  linkedin_follow_up_date = now() + ($3 || ' days')::interval, linkedin_connection_status = 'pending',
                  linkedin_last_activity = now(), linkedin_error = NULL, last_contacted_at = now(), updated_at = now()
           WHERE id = $1`,
          [row.lead_id, row.message, (cfg.follow_up_days[0] ?? 3)]
        );
        sent++;
        lastSent = Date.now();
        detail.push(`sent #${row.id} \u2192 ${profileUrl}`);
      }
    } else if (result.mode === "manual") {
      // No sender configured — this is NOT an error. The message simply stays
      // queued for the operator to send from LinkedIn (open profile in Admin).
      queued++;
      detail.push(`#${row.id} ready for manual send (no sender configured)`);
    } else {
      await pool.query(
        `UPDATE outreach_activities SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`,
        [row.id, String(result.error || "send failed").slice(0, 500)]
      );
      await pool.query(`UPDATE leads SET linkedin_status = 'failed', linkedin_error = $2, updated_at = now() WHERE id = $1`,
        [row.lead_id, String(result.error || "send failed").slice(0, 500)]);
      failed++;
      detail.push(`failed #${row.id}: ${String(result.error || "").slice(0, 120)}`);
    }
  }

  return { sent, queued, failed, capped: sent + failed >= cap, stopped: false, simulated: simulate, mode, detail: detail.slice(0, 20) };
}

// ---------------------------------------------------------------------------
// MANUAL OPERATIONS (no integration required to run the workflow)
// ---------------------------------------------------------------------------
export async function markSent(id: number): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getLinkedInConfig();
  const r = await pool.query(
    `UPDATE outreach_activities SET status = 'sent', sent_at = COALESCE(sent_at, now()), provider_message_id = COALESCE(provider_message_id, 'manual'), error = NULL,
            follow_up_date = now() + ($2 || ' days')::interval, updated_at = now()
     WHERE id = $1 AND channel = 'linkedin' AND status = 'queued' RETURNING lead_id`,
    [id, cfg.follow_up_days[0] ?? 3]
  );
  if ((r.rowCount ?? 0) === 0) return { ok: false, error: "Only queued messages can be marked sent." };
  await pool.query(
    `UPDATE leads SET linkedin_status = 'sent', linkedin_sent_at = now(), linkedin_follow_up_date = now() + ($2 || ' days')::interval,
            linkedin_connection_status = 'pending', linkedin_last_activity = now(), updated_at = now() WHERE id = $1`,
    [r.rows[0].lead_id, cfg.follow_up_days[0] ?? 3]
  );
  return { ok: true };
}

export async function markReplied(id: number): Promise<{ ok: boolean; error?: string }> {
  const r = await pool.query(
    `UPDATE outreach_activities SET status = 'replied', replied_at = now(), follow_up_date = NULL, updated_at = now()
     WHERE id = $1 AND channel = 'linkedin' AND status IN ('sent','queued','follow_up_due') RETURNING lead_id`,
    [id]
  );
  if ((r.rowCount ?? 0) === 0) return { ok: false, error: "Only sent/queued messages can be marked replied." };
  await pool.query(
    `UPDATE leads SET linkedin_status = 'replied', linkedin_connection_status = 'connected', linkedin_follow_up_date = NULL,
            linkedin_last_activity = now(), status = 'replied', updated_at = now() WHERE id = $1`,
    [r.rows[0].lead_id]
  );
  return { ok: true };
}

// ---------------------------------------------------------------------------
// FOLLOW-UPS — Day 3 / Day 7 measured from the intro's sent_at
// ---------------------------------------------------------------------------
export async function scheduleFollowUps(cfg: LinkedInConfig): Promise<number> {
  await ensureLinkedInSchema();
  const days = cfg.follow_up_days.length ? cfg.follow_up_days.slice(0, 2) : [3, 7];
  let scheduled = 0;

  for (let n = 0; n < days.length; n++) {
    const prev = n;       // step that must already be sent: 0 = intro
    const next = n + 1;   // follow-up being created: 1 = 3d, 2 = 7d
    // Anchor is ALWAYS the intro (fn=0): FU1 at intro+days[0], FU2 at intro+days[1].
    // The previous step must exist and be sent before the next is created
    // (mirrors the email pipeline), so approvals are never skipped.
    const rows = await pool.query(
      `SELECT a.*, l.*, i.id AS intro_id FROM outreach_activities a
       JOIN leads l ON l.id = a.lead_id
       JOIN outreach_activities i ON i.lead_id = a.lead_id AND i.channel = 'linkedin' AND i.follow_up_number = 0
       WHERE a.channel = 'linkedin' AND a.follow_up_number = $1
         AND a.status = 'sent'
         AND i.sent_at + ($2 || ' days')::interval <= now()
         AND COALESCE(l.status,'active') NOT IN (${BLOCKED_LEAD_STATUSES.map((_, i2) => `$${i2 + 4}`).join(",")})
         AND l.converted_to_client_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM outreach_activities e2
                         WHERE e2.lead_id = a.lead_id AND e2.channel = 'linkedin' AND e2.follow_up_number = $3)
       LIMIT 100`,
      [prev, days[n], next, ...BLOCKED_LEAD_STATUSES]
    );

    for (const row of rows.rows) {
      let gen: GenerationResult;
      try {
        gen = await generateFollowUpMessage(row, row.message || "", next);
      } catch (e: any) {
        console.error("follow-up generation failed", row.lead_id, e?.message);
        continue;
      }
      const ins = await pool.query(
        `INSERT INTO outreach_activities (lead_id, channel, follow_up_number, message, status, personalization_summary, personalization_data, framework, ai_generated, scheduled_at, updated_at)
         VALUES ($1, 'linkedin', $2, $3, $4, $5, $6, $7, $8, now(), now())
         ON CONFLICT (lead_id, channel, follow_up_number) DO NOTHING
         RETURNING id`,
        [row.lead_id, next, gen.message, cfg.approval_required ? "awaiting_approval" : "queued", gen.summary,
         JSON.stringify({ ai: gen.ai, intro: (row.message || "").slice(0, 80) }), gen.framework, gen.ai]
      );
      if ((ins.rowCount ?? 0) > 0) {
        scheduled++;
        await pool.query(
          `UPDATE leads SET linkedin_status = $2, linkedin_follow_up_date = (SELECT i2.sent_at + ($3 || ' days')::interval FROM outreach_activities i2 WHERE i2.id = $4), updated_at = now()
           WHERE leads.id = $1`,
          [row.lead_id, cfg.approval_required ? "awaiting_approval" : "queued", days[n], row.intro_id]
        );
      }
    }
  }
  return scheduled;
}

// ---------------------------------------------------------------------------
// ANALYTICS DASHBOARD
// ---------------------------------------------------------------------------
export async function getLinkedInDashboard(filters: { status?: string; today?: boolean } = {}) {
  await ensureLinkedInSchema();
  const cfg = await getLinkedInConfig();
  const fu1 = cfg.follow_up_days[0] ?? 3;

  const statsQ = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM outreach_activities WHERE channel='linkedin') AS total_generated,
      (SELECT count(*)::int FROM outreach_activities WHERE channel='linkedin' AND status='awaiting_approval') AS awaiting,
      (SELECT count(*)::int FROM outreach_activities WHERE channel='linkedin' AND status='sent') AS sent,
      (SELECT count(*)::int FROM outreach_activities WHERE channel='linkedin' AND status='replied') AS replies,
      (SELECT count(*)::int FROM outreach_activities WHERE channel='linkedin' AND status='failed') AS failed,
      (SELECT count(*)::int FROM outreach_activities WHERE channel='linkedin' AND follow_up_number > 0) AS followups_generated,
      (SELECT count(*)::int FROM outreach_activities WHERE channel='linkedin' AND status='sent' AND sent_at::date = CURRENT_DATE) AS sent_today,
      (SELECT count(*)::int FROM outreach_activities WHERE channel='linkedin' AND status='sent' AND sent_at + (${fu1} || ' days')::interval <= now()) AS followups_due,
      (SELECT count(*)::int FROM leads WHERE linkedin_status IN ('sent','replied') AND converted_to_client_id IS NOT NULL) AS clients_from_linkedin,
      (SELECT count(*)::int FROM leads WHERE linkedin_status IN ('sent','replied') AND meeting_status = 'booked') AS calls_booked
  `);
  const s = statsQ.rows[0];
  const repliesAll = Number(s.replies);
  const sentAll = Number(s.sent) + repliesAll;
  const replyRate = sentAll > 0 ? Math.round((repliesAll / sentAll) * 100) : 0;
  const convRate = sentAll > 0 ? Math.round((Number(s.clients_from_linkedin) / sentAll) * 100) : 0;
  const leadsToday = Number((await pool.query(
    `SELECT count(*)::int n FROM leads WHERE linkedin_status IS NOT NULL AND linkedin_status <> 'not_eligible' AND created_at::date = CURRENT_DATE`
  )).rows[0].n);

  // queue with filters ("follow_up_due" is computed, not a stored status)
  const where: string[] = [`a.channel = 'linkedin'`];
  const params: any[] = [];
  if (filters.status === "follow_up_due") {
    where.push(`a.follow_up_number = 0 AND a.status = 'sent' AND a.sent_at + (${fu1} || ' days')::interval <= now()
                AND NOT EXISTS (SELECT 1 FROM outreach_activities f WHERE f.lead_id = a.lead_id AND f.channel = 'linkedin' AND f.follow_up_number = 1)`);
  } else if (filters.status) {
    params.push(filters.status); where.push(`a.status = $${params.length}`);
  }
  if (filters.today) { where.push(`a.created_at::date = CURRENT_DATE`); }
  const list = await pool.query(
    `SELECT a.*, l.full_name, l.business_name, l.industry, l.lead_score, l.linkedin_url, l.status AS lead_status, l.converted_to_client_id
     FROM outreach_activities a JOIN leads l ON l.id = a.lead_id
     WHERE ${where.join(" AND ")}
     ORDER BY a.created_at DESC, a.id DESC LIMIT 300`,
    params
  );

  return {
    stats: {
      leadsProcessedToday: leadsToday,
      generated: Number(s.total_generated),
      awaitingApproval: Number(s.awaiting),
      approved: Number((await pool.query(`SELECT count(*)::int n FROM outreach_activities WHERE channel='linkedin' AND status IN ('approved','queued')`)).rows[0].n),
      queued: Number((await pool.query(`SELECT count(*)::int n FROM outreach_activities WHERE channel='linkedin' AND status='queued'`)).rows[0].n),
      sent: Number(s.sent),
      failed: Number(s.failed),
      replies: repliesAll,
      replyRate,
      followupsGenerated: Number(s.followups_generated),
      followupsDue: Number(s.followups_due),
      callsBooked: Number(s.calls_booked),
      clients: Number(s.clients_from_linkedin),
      conversionRate: convRate,
      sentToday: Number(s.sent_today),
      dailyLimit: cfg.daily_limit,
    },
    queue: list.rows,
    config: cfg,
    sender: { mode: getSenderMode(), simulated: cfg.test_mode },
  };
}

// ---------------------------------------------------------------------------
// PIPELINE ENTRY — used by the engine hook + manual "generate now"
// ---------------------------------------------------------------------------
export async function runLinkedInPipeline(opts: { generate?: boolean; send?: boolean; simulate?: boolean } = {}): Promise<any> {
  await ensureLinkedInSchema();
  const cfg = await getLinkedInConfig();
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
    cfg: { enabled: cfg.enabled, test: cfg.test_mode, approvalRequired: cfg.approval_required, dailyLimit: cfg.daily_limit, stopped: cfg.emergency_stop },
    generated,
    reasons,
    sendResult,
  };
  if (opts.send && sendResult) out.followupsScheduled = sendResult.followupsScheduled;
  return out;
}
