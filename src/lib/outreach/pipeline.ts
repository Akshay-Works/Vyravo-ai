// ============================================================================
// OUTREACH PIPELINE — daily leads → qualify → personalize → queue → send →
// track → follow-up. Extends the existing email_queue / email_templates /
// Resend (sendEmail) infrastructure. Idempotent at the DB level.
// ============================================================================
import { pool } from "@/db";
import { renderTemplate, leadToTemplateData } from "@/lib/email/templates";
import { sendEmail, DEFAULT_REPLY_TO } from "@/lib/email/send";
import { getOutreachConfig, type OutreachConfig } from "./config";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// leads with these statuses are never emailed automatically
export const BLOCKED_STATUSES = ["contacted", "replied", "won", "lost", "do_not_contact", "skipped"];

// ---------------------------------------------------------------------------
// SCHEMA (idempotent, run on every pipeline call)
// ---------------------------------------------------------------------------
export async function ensureOutreachSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS outreach_events (
      id serial PRIMARY KEY,
      lead_id integer NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      recipient_email text NOT NULL,
      subject text NOT NULL,
      body text NOT NULL,
      follow_up_number integer NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'queued',
      error_message text,
      resend_id text,
      test_send boolean NOT NULL DEFAULT false,
      queued_at timestamptz DEFAULT now(),
      sent_at timestamptz,
      failed_at timestamptz,
      created_at timestamptz DEFAULT now(),
      UNIQUE (lead_id, follow_up_number)
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_outreach_events_status ON outreach_events(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_outreach_events_sent ON outreach_events(sent_at)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS outreach_config (k text PRIMARY KEY, v text NOT NULL)`);
}

// ---------------------------------------------------------------------------
// TEMPLATES — reuse the existing email_templates system. Seeded once; the
// admin can edit them in Admin → Email Templates (automation follows edits).
// ---------------------------------------------------------------------------
const OUTREACH_TEMPLATES: { type: string; name: string; subject: string; body: string }[] = [
  {
    type: "outreach-intro",
    name: "Outreach — Intro (automated)",
    subject: "A quick idea for {{company}}",
    body:
      "<p>Hi {{firstName}},</p>" +
      "<p>I came across <strong>{{company}}</strong> while mapping {{industry}} businesses that are losing time to manual work.</p>" +
      "<p>One thing stood out: {{challenge}}</p>" +
      "<p>At Vyravo AI we build {{services}} for businesses like yours — real workflow automation, not another AI toy.</p>" +
      "<p>Would a short 15-minute call this week work for you? If a call is too much, just reply with \"more info\" and I'll send a quick note.</p>" +
      "<p>Warm regards,<br/>Akshay Navale<br/>Founder, Vyravo AI</p>",
  },
  {
    type: "outreach-followup-1",
    name: "Outreach — Follow-up 1 (automated)",
    subject: "Re: A quick idea for {{company}}",
    body:
      "<p>Hi {{firstName}},</p>" +
      "<p>Just following up on my note about {{company}}. Automated follow-ups, {{challenge}} — those are the two things we fix most often.</p>" +
      "<p>Happy to share 2–3 concrete examples from similar {{industry}} businesses. Worth a quick call?</p>" +
      "<p>Warm regards,<br/>Akshay Navale<br/>Founder, Vyravo AI</p>",
  },
  {
    type: "outreach-followup-2",
    name: "Outreach — Follow-up 2 (automated)",
    subject: "Last follow-up — {{company}}",
    body:
      "<p>Hi {{firstName}},</p>" +
      "<p>Last one from me. If {{challenge}} is on your list for this quarter, my door is open — {{company}} would be a genuinely good fit for {{services}}.</p>" +
      "<p>Either way, wishing you and the {{company}} team a great quarter.</p>" +
      "<p>Warm regards,<br/>Akshay Navale<br/>Founder, Vyravo AI</p>",
  },
];

export async function ensureOutreachTemplates(): Promise<void> {
  for (const t of OUTREACH_TEMPLATES) {
    const existing = await pool.query(`SELECT id FROM email_templates WHERE email_type = $1 LIMIT 1`, [t.type]);
    if ((existing.rowCount ?? 0) === 0) {
      await pool.query(
        `INSERT INTO email_templates (name, email_type, subject, body, is_active) VALUES ($1, $2, $3, $4, true)`,
        [t.name, t.type, t.subject, t.body]
      );
    }
  }
}

async function templateFor(followUpNumber: number): Promise<{ subject: string; body: string }> {
  const type = followUpNumber === 0 ? "outreach-intro" : followUpNumber === 1 ? "outreach-followup-1" : "outreach-followup-2";
  const r = await pool.query(`SELECT subject, body FROM email_templates WHERE email_type = $1 AND is_active = true ORDER BY id DESC LIMIT 1`, [type]);
  if ((r.rowCount ?? 0) === 0) {
    const t = OUTREACH_TEMPLATES.find((x) => x.type === type)!;
    return { subject: t.subject, body: t.body };
  }
  return r.rows[0];
}

/** Render the exact email for a lead + follow-up number. Never fabricates. */
export async function buildOutreachEmail(lead: any, followUpNumber = 0): Promise<{ subject: string; html: string; data: Record<string, string> }> {
  const tpl = await templateFor(followUpNumber);
  const data = leadToTemplateData(lead);
  // richer per-lead personalization (still real lead data only)
  const services = Array.isArray(lead.recommended_services)
    ? lead.recommended_services.join(", ")
    : (lead.recommended_services || "");
  data.services = services || "automation for follow-ups, lead handling and reporting";
  data.automation_goals = lead.automation_goals || "";
  data.current_software = lead.current_software || "";
  data.monthly_leads = lead.monthly_leads || "";
  // fallbacks that never claim facts: a question instead of an assertion when no challenge is on file
  if (!data.challenge) data.challenge = "I'd love to learn where manual work slows your team down most";
  return {
    subject: renderTemplate(tpl.subject, data),
    html: renderTemplate(tpl.body, data, { html: true }),
    data,
  };
}

// ---------------------------------------------------------------------------
// DETECTION — new, qualified, valid-email leads that were never emailed
// ---------------------------------------------------------------------------
export async function discoverNewLeads(cfg: OutreachConfig): Promise<any[]> {
  await ensureOutreachSchema();
  const r = await pool.query(
    `SELECT l.* FROM leads l
     WHERE l.email IS NOT NULL AND TRIM(l.email) <> ''
       AND l.email ~* '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'
       AND COALESCE(l.status, 'active') NOT IN (${BLOCKED_STATUSES.map((_, i) => `$${i + 1}`).join(",")})
       AND COALESCE(l.lead_score, 0) >= $${BLOCKED_STATUSES.length + 1}
       AND NOT EXISTS (SELECT 1 FROM outreach_events e WHERE e.lead_id = l.id)
     ORDER BY l.lead_score DESC, l.id DESC
     LIMIT 200`,
    [...BLOCKED_STATUSES, cfg.min_score]
  );
  return r.rows;
}

// ---------------------------------------------------------------------------
// GENERATE + QUEUE (idempotent — UNIQUE(lead_id, follow_up_number))
// ---------------------------------------------------------------------------
export async function generateAndQueue(cfg: OutreachConfig, opts: { leadId?: number; followUpNumber?: number } = {}): Promise<{ queued: number; skipped: string[] }> {
  await ensureOutreachTemplates();
  let queued = 0;
  const skipped: string[] = [];

  const processLead = async (lead: any, followUpNumber: number) => {
    const email = String(lead.email || "").trim();
    if (!email || !EMAIL_RE.test(email)) { skipped.push(`#${lead.id} invalid email`); return; }
    const html = await buildOutreachEmail(lead, followUpNumber);
    const ins = await pool.query(
      `INSERT INTO outreach_events (lead_id, recipient_email, subject, body, follow_up_number, status, queued_at)
       VALUES ($1, $2, $3, $4, $5, 'queued', now())
       ON CONFLICT (lead_id, follow_up_number) DO NOTHING
       RETURNING id`,
      [lead.id, email, html.subject, html.html, followUpNumber]
    );
    if ((ins.rowCount ?? 0) === 0) return; // already exists → duplicate-safe
    await pool.query(
      `INSERT INTO email_queue (lead_id, email_type, scheduled_for, status, template_data)
       VALUES ($1, 'outreach', now(), 'pending', $2)`,
      [lead.id, JSON.stringify({
        to: email,
        subject: html.subject,
        html: html.html,
        followUpNumber,
        outreach_event_id: ins.rows[0].id,
        leadId: lead.id,
        leadName: lead.full_name || lead.business_name || "",
      })]
    );
    queued++;
  };

  if (opts.leadId) {
    const r = await pool.query(`SELECT * FROM leads WHERE id = $1`, [opts.leadId]);
    if ((r.rowCount ?? 0) > 0) await processLead(r.rows[0], opts.followUpNumber || 0);
  } else {
    const leads = await discoverNewLeads(cfg);
    for (const lead of leads) await processLead(lead, 0);
  }
  return { queued, skipped };
}

// ---------------------------------------------------------------------------
// FOLLOW-UPS — schedule based on days since last send, only when no reply/DNC
// ---------------------------------------------------------------------------
export async function scheduleFollowUps(cfg: OutreachConfig): Promise<number> {
  await ensureOutreachTemplates();
  const days = cfg.follow_up_days.length ? cfg.follow_up_days : [3, 7];
  let scheduled = 0;
  for (let n = 0; n < days.length; n++) {
    const delayDays = n === 0 ? days[0] : days[n]; // follow-up n+1 fires delayDays after the nth email
    const r = await pool.query(
      `SELECT e.* FROM outreach_events e
       JOIN leads l ON l.id = e.lead_id
       WHERE e.follow_up_number = $1 AND e.status = 'sent' AND e.test_send = false
         AND e.sent_at + ($2 || ' days')::interval <= now()
         AND COALESCE(l.status, 'active') NOT IN (${BLOCKED_STATUSES.map((_, i) => `$${i + 3}`).join(",")})
         AND NOT EXISTS (SELECT 1 FROM outreach_events e2 WHERE e2.lead_id = e.lead_id AND e2.follow_up_number = $1 + 1)
       LIMIT 100`,
      [n, delayDays, ...BLOCKED_STATUSES]
    );
    for (const ev of r.rows) {
      const lead = await pool.query(`SELECT * FROM leads WHERE id = $1`, [ev.lead_id]);
      if ((lead.rowCount ?? 0) === 0) continue;
      const html = await buildOutreachEmail(lead.rows[0], n + 1);
      const ins = await pool.query(
        `INSERT INTO outreach_events (lead_id, recipient_email, subject, body, follow_up_number, status, queued_at)
         VALUES ($1, $2, $3, $4, $5, 'queued', now())
         ON CONFLICT (lead_id, follow_up_number) DO NOTHING RETURNING id`,
        [ev.lead_id, ev.recipient_email, html.subject, html.html, n + 1]
      );
      if ((ins.rowCount ?? 0) === 0) continue;
      await pool.query(
        `INSERT INTO email_queue (lead_id, email_type, scheduled_for, status, template_data)
         VALUES ($1, 'outreach', now(), 'pending', $2)`,
        [ev.lead_id, JSON.stringify({
          to: ev.recipient_email, subject: html.subject, html: html.html,
          followUpNumber: n + 1, outreach_event_id: ins.rows[0].id,
          leadId: ev.lead_id, leadName: lead.rows[0].full_name || lead.rows[0].business_name || "",
        })]
      );
      scheduled++;
    }
  }
  return scheduled;
}

// ---------------------------------------------------------------------------
// SEND — controlled, rate-limited, limit-capped, test-mode aware
// ---------------------------------------------------------------------------
export async function processOutreachQueue(cfg: OutreachConfig): Promise<{ sent: number; failed: number; skipped: number; capped: boolean }> {
  await ensureOutreachSchema();
  const rows = await pool.query(
    `SELECT q.* FROM email_queue q
     WHERE q.status = 'pending' AND q.scheduled_for <= now()
       AND q.template_data->>'outreach_event_id' IS NOT NULL
     ORDER BY q.scheduled_for, q.id
     LIMIT 200`
  );

  let sentToday = 0;
  if (!cfg.test_mode) {
    const c = await pool.query(`SELECT count(*)::int n FROM outreach_events WHERE status = 'sent' AND test_send = false AND sent_at::date = CURRENT_DATE`);
    sentToday = c.rows[0]?.n || 0;
  }
  const remaining = cfg.test_mode ? rows.rows.length : Math.max(0, cfg.daily_limit - sentToday);
  const batch = (rows.rows as any[]).slice(0, remaining);
  const capped = rows.rows.length > batch.length;

  let sent = 0, failed = 0, skipped = 0;
  let lastSendAt = 0;
  for (const row of batch) {
    const data = row.template_data || {};
    const eventId = Number(data.outreach_event_id);
    // duplicate protection at send-time: only a still-queued event may be sent
    const ev = await pool.query(`SELECT id, status FROM outreach_events WHERE id = $1`, [eventId]);
    if ((ev.rowCount ?? 0) === 0 || ev.rows[0].status !== "queued") {
      await pool.query(`UPDATE email_queue SET status = 'skipped' WHERE id = $1`, [row.id]);
      skipped++;
      continue;
    }
    const to = cfg.test_mode ? cfg.test_recipient : String(data.to || "");
    if (!to || !EMAIL_RE.test(to)) {
      await pool.query(`UPDATE email_queue SET status = 'failed', template_data = template_data || '{"error":"invalid recipient"}'::jsonb WHERE id = $1`, [row.id]);
      await pool.query(`UPDATE outreach_events SET status = 'failed', error_message = 'invalid recipient', failed_at = now() WHERE id = $1`, [eventId]);
      failed++;
      continue;
    }
    // min gap between sends
    const gap = cfg.min_gap_secs * 1000;
    if (sent + failed > 0 && gap > 0) {
      const wait = Math.max(0, gap - (Date.now() - lastSendAt));
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    lastSendAt = Date.now();
    const result = await sendEmail({ to, subject: data.subject || "Vyravo AI", html: data.html, replyTo: DEFAULT_REPLY_TO });
    if (result.sent) {
      await pool.query(`UPDATE email_queue SET status = 'sent', sent_at = now() WHERE id = $1`, [row.id]);
      await pool.query(
        `UPDATE outreach_events SET status = 'sent', sent_at = now(), resend_id = $2, test_send = $3 WHERE id = $1`,
        [eventId, (result as any).id || null, cfg.test_mode]
      );
      const leadId = Number(data.leadId);
      if (leadId) {
        const nextF = cfg.follow_up_days.length ? cfg.follow_up_days[0] : 3;
        await pool.query(
          `UPDATE leads SET last_contacted_at = now(), next_follow_up = now() + ($1 || ' days')::interval WHERE id = $2`,
          [nextF, leadId]
        );
      }
      sent++;
    } else {
      await pool.query(`UPDATE email_queue SET status = 'failed' WHERE id = $1`, [row.id]);
      await pool.query(
        `UPDATE outreach_events SET status = 'failed', error_message = $2, failed_at = now() WHERE id = $1`,
        [eventId, String(result.error || "send failed").slice(0, 500)]
      );
      failed++;
    }
  }
  return { sent, failed, skipped, capped };
}

// ---------------------------------------------------------------------------
// MANUAL CONTROLS (keep the human in charge)
// ---------------------------------------------------------------------------
export async function sendOutreachNow(leadId: number): Promise<{ ok: boolean; error?: string; to?: string }> {
  const cfg = await getOutreachConfig();
  const lead = await pool.query(`SELECT * FROM leads WHERE id = $1`, [leadId]);
  if ((lead.rowCount ?? 0) === 0) return { ok: false, error: "Lead not found." };
  const l = lead.rows[0];
  if (BLOCKED_STATUSES.includes(String(l.status || ""))) return { ok: false, error: `Lead status is ${l.status} — not eligible.` };
  const email = String(l.email || "").trim();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Lead has no valid email address." };

  // use an existing event (0) or create it fresh
  let ev = await pool.query(`SELECT * FROM outreach_events WHERE lead_id = $1 AND follow_up_number = 0`, [leadId]);
  if ((ev.rowCount ?? 0) === 0) {
    await generateAndQueue(cfg, { leadId, followUpNumber: 0 });
    ev = await pool.query(`SELECT * FROM outreach_events WHERE lead_id = $1 AND follow_up_number = 0`, [leadId]);
  }
  if ((ev.rowCount ?? 0) === 0) return { ok: false, error: "Could not prepare email for this lead." };
  const event = ev.rows[0];
  if (event.status === "sent" || event.status === "replied") return { ok: false, error: "This lead has already received email 1." };

  const to = cfg.test_mode ? cfg.test_recipient : email;
  const result = await sendEmail({ to, subject: event.subject, html: event.body, replyTo: DEFAULT_REPLY_TO });
  if (result.sent) {
    await pool.query(
      `UPDATE outreach_events SET status = 'sent', sent_at = now(), resend_id = $2, test_send = $3 WHERE id = $1`,
      [event.id, (result as any).id || null, cfg.test_mode]
    );
    const nextF = cfg.follow_up_days.length ? cfg.follow_up_days[0] : 3;
    await pool.query(`UPDATE leads SET last_contacted_at = now(), next_follow_up = now() + ($1 || ' days')::interval WHERE id = $2`, [nextF, leadId]);
    return { ok: true, to };
  }
  await pool.query(`UPDATE outreach_events SET status = 'failed', error_message = $2, failed_at = now() WHERE id = $1`, [event.id, String(result.error || "send failed").slice(0, 500)]);
  return { ok: false, error: result.error || "Send failed" };
}

export async function queueLead(leadId: number): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getOutreachConfig();
  const r = await generateAndQueue(cfg, { leadId, followUpNumber: 0 });
  return r.queued ? { ok: true } : { ok: false, error: "Lead already queued/emailed or not eligible." };
}

export async function skipLead(leadId: number): Promise<void> {
  // mark the current queue row skipped + event skipped (it will never auto-run again)
  const ev = await pool.query(`UPDATE outreach_events SET status = 'skipped' WHERE lead_id = $1 AND status = 'queued'`, [leadId]);
  await pool.query(
    `UPDATE email_queue SET status = 'skipped' WHERE lead_id = $1 AND status = 'pending' AND template_data->>'outreach_event_id' IS NOT NULL`,
    [leadId]
  );
  if ((ev.rowCount ?? 0) === 0) {
    await pool.query(`UPDATE leads SET status = 'skipped' WHERE id = $1`, [leadId]);
  }
}

export async function retryLead(leadId: number): Promise<{ ok: boolean; error?: string }> {
  const ev = await pool.query(
    `UPDATE outreach_events SET status = 'queued', error_message = NULL, queued_at = now()
     WHERE id = (SELECT id FROM outreach_events WHERE lead_id = $1 AND status = 'failed' ORDER BY id DESC LIMIT 1)
     RETURNING id, recipient_email, subject, body`,
    [leadId]
  );
  if ((ev.rowCount ?? 0) === 0) return { ok: false, error: "No failed email to retry." };
  const e = ev.rows[0];
  await pool.query(
    `INSERT INTO email_queue (lead_id, email_type, scheduled_for, status, template_data)
     VALUES ($1, 'outreach', now(), 'pending', $2)`,
    [leadId, JSON.stringify({ to: e.recipient_email, subject: e.subject, html: e.body, followUpNumber: e.follow_up_number ?? 0, outreach_event_id: e.id, leadId, leadName: "" })]
  );
  return { ok: true };
}

export async function markReplied(leadId: number): Promise<void> {
  await pool.query(`UPDATE leads SET status = 'replied', next_follow_up = NULL WHERE id = $1`, [leadId]);
  await pool.query(`UPDATE outreach_events SET status = 'cancelled' WHERE lead_id = $1 AND status = 'queued'`, [leadId]);
  await pool.query(`UPDATE email_queue SET status = 'skipped' WHERE lead_id = $1 AND status = 'pending' AND template_data->>'outreach_event_id' IS NOT NULL`, [leadId]);
}

export async function doNotContact(leadId: number): Promise<void> {
  await pool.query(`UPDATE leads SET status = 'do_not_contact', next_follow_up = NULL WHERE id = $1`, [leadId]);
  await pool.query(`UPDATE outreach_events SET status = 'cancelled' WHERE lead_id = $1 AND status IN ('queued')`, [leadId]);
  await pool.query(`UPDATE email_queue SET status = 'skipped' WHERE lead_id = $1 AND status = 'pending' AND template_data->>'outreach_event_id' IS NOT NULL`, [leadId]);
}

// ---------------------------------------------------------------------------
// STATS + LIST for the admin dashboard
// ---------------------------------------------------------------------------
export async function getOutreachDashboard() {
  await ensureOutreachSchema();
  const one = async (sql: string, params: any[] = []) => {
    try { const r = await pool.query(sql, params); return Number(r.rows[0]?.n ?? 0); } catch { return 0; }
  };
  const stats = {
    todayLeads: await one(`SELECT count(*)::int n FROM leads WHERE created_at::date = CURRENT_DATE`),
    qualifiedToday: await one(`SELECT count(*)::int n FROM leads WHERE created_at::date = CURRENT_DATE AND lead_score >= 60`),
    generated: await one(`SELECT count(*)::int n FROM outreach_events`),
    queued: await one(`SELECT count(*)::int n FROM outreach_events WHERE status = 'queued'`),
    sent: await one(`SELECT count(*)::int n FROM outreach_events WHERE status = 'sent'`),
    failed: await one(`SELECT count(*)::int n FROM outreach_events WHERE status = 'failed'`),
    replies: await one(`SELECT count(*)::int n FROM leads WHERE status = 'replied'`),
    followupsDue: await one(`SELECT count(*)::int n FROM outreach_events WHERE status = 'queued' AND follow_up_number > 0`),
    sentToday: await one(`SELECT count(*)::int n FROM outreach_events WHERE status = 'sent' AND sent_at::date = CURRENT_DATE AND test_send = false`),
    auto: (await getOutreachConfig()).auto_outreach,
    test: (await getOutreachConfig()).test_mode,
  };

  const list = await pool.query(
    `SELECT e.id, e.lead_id, e.recipient_email, e.subject, e.status, e.error_message, e.follow_up_number,
            e.queued_at, e.sent_at, e.failed_at, e.test_send,
            l.full_name, l.business_name, l.lead_score, l.status AS lead_status
     FROM outreach_events e
     LEFT JOIN leads l ON l.id = e.lead_id
     ORDER BY e.id DESC
     LIMIT 80`
  );
  return { stats, events: list.rows, config: await getOutreachConfig() };
}

// ---------------------------------------------------------------------------
// FULL PIPELINE (called by the engine hook + admin "run now")
// ---------------------------------------------------------------------------
export async function runOutreachPipeline(opts: { send?: boolean } = {}): Promise<any> {
  const cfg = await getOutreachConfig();
  await ensureOutreachSchema();
  await ensureOutreachTemplates();

  const gen = await generateAndQueue(cfg);
  const followups = await scheduleFollowUps(cfg);

  let sendResult: any = null;
  // auto-send only when AUTO OUTREACH is ON (test mode still respected)
  if (opts.send && cfg.auto_outreach) {
    sendResult = await processOutreachQueue(cfg);
  }
  return {
    cfg: { auto: cfg.auto_outreach, test: cfg.test_mode, dailyLimit: cfg.daily_limit },
    newQueued: gen.queued, skipped: gen.skipped, followupsScheduled: followups, sendResult,
  };
}
