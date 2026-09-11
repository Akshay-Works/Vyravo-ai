// ============================================================================
// OUTREACH PIPELINE — daily leads → qualify → personalize → queue → send →
// track → follow-up. Extends the existing email_queue / email_templates /
// Resend (sendEmail) infrastructure. Idempotent at the DB level.
// ============================================================================
import { pool } from "@/db";
import { promises as dns } from "node:dns";
import { renderTemplate, leadToTemplateData } from "@/lib/email/templates";
import { renderOutreachHtml } from "./premium";
import { resolvePoint1, resolvePoint2 } from "./personalize";
import { sendEmail, DEFAULT_REPLY_TO } from "@/lib/email/send";
import { normalizeMessageId } from "./reply-parse";
import { getOutreachConfig, type OutreachConfig } from "./config";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// leads in these states must never be emailed automatically. NOTE: 'contacted'
// is deliberately NOT in this list — a lead that we already emailed SHOULD
// receive follow-ups; the intro's follow-up schedule depends on it.
export const BLOCKED_STATUSES = ["replied", "won", "lost", "do_not_contact", "skipped"];

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
  await pool.query(`ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS delivered_at timestamptz`);
  await pool.query(`ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS claim_started_at timestamptz`);
  // reply tracking needs an index on the provider message-id (matching key)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_outreach_events_resend_id ON outreach_events(resend_id)`);
  // ---- leads: reply state (Lead Data Quality + reply pipeline) ----
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS reply_received boolean NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS replied_at timestamptz`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_inbound_email_at timestamptz`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS latest_reply_message_id text`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS latest_reply_subject text`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS latest_reply_preview text`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS outreach_started_at timestamptz`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_count integer NOT NULL DEFAULT 0`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_reply_received ON leads(reply_received)`);
  // ---- processed inbox replies (idempotency for duplicate events/retries) ----
  await pool.query(`CREATE TABLE IF NOT EXISTS outreach_replies_seen (
    message_id text PRIMARY KEY,
    lead_id integer NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    matched_at timestamptz DEFAULT now()
  )`);
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
    subject: "An idea for {{company}}",
    body:
      "<p style=\"margin:0 0 16px;\">{{greeting}}</p>" +
      "<p style=\"margin:0 0 16px;\">I came across <strong>{{company}}</strong>{{cityCountry}} while looking at {{industry_phrase}}. One thing in particular caught my eye: {{point1_lc}}</p>" +
      "<p style=\"margin:0 0 16px;\">{{point2}}</p>" +
      "<p style=\"margin:0 0 16px;\">At Vyravo AI we implement {{services}} — live and working for your team, not a demo. The outcome is simple: every enquiry gets an answer the moment it arrives, follow-ups happen on their own, and nothing slips through the cracks.</p>" +
      "<p style=\"margin:0 0 24px;\">Open to a 15-minute call this week? If a call is too much, just reply &ldquo;more info&rdquo; and I&rsquo;ll send 2&ndash;3 examples from similar {{industry}} businesses.</p>",
  },
  {
    type: "outreach-followup-1",
    name: "Outreach — Follow-up 1 (automated)",
    subject: "Re: An idea for {{company}}",
    body:
      "<p style=\"margin:0 0 16px;\">{{greeting}}</p>" +
      "<p style=\"margin:0 0 16px;\">A brief follow-up on my note. {{point1}} It's the single gap our {{industry}} clients ask us to close first.</p>" +
      "<p style=\"margin:0 0 16px;\">{{point2}}</p>" +
      "<p style=\"margin:0 0 24px;\">If it's still on your mind, a 15-minute call works. Otherwise, reply &ldquo;more info&rdquo; and I'll keep it to a short email.</p>",
  },
  {
    type: "outreach-followup-2",
    name: "Outreach — Follow-up 2 (automated)",
    subject: "{{company}} — last note",
    body:
      "<p style=\"margin:0 0 16px;\">{{greeting}}</p>" +
      "<p style=\"margin:0 0 16px;\">Last note from me, I promise. If the gap I mentioned is on your list this quarter, I'd genuinely enjoy showing you what we do — {{services}}.</p>" +
      "<p style=\"margin:0 0 16px;\">{{point2}}</p>" +
      "<p style=\"margin:0 0 24px;\">Either way, I'll leave you with one thought — {{point1}}</p>" +
      "<p style=\"margin:0 0 24px;\">Worth a 15-minute call this week? If not, just reply &ldquo;not now&rdquo; and I'll close the loop — no hard feelings.</p>",
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
function greetingFor(lead: any): string {
  // A real (verified) person wins; a company name is ONLY used when it clearly
  // looks like a human name (2-4 alphabetic words, no business keywords, no
  // digits, no "&"). Anything else gets a clean "Hello," — never "Hi 0,".
  const dm = lead.decision_maker_name || lead.first_name || null;
  const firstName = dm ? String(dm).trim().split(/\s+/)[0] : null;
  if (firstName && /^[A-Za-z][A-Za-z.'-]{1,20}$/.test(firstName)) return `Hi ${firstName},`;
  const full = String(lead.full_name || lead.fullName || lead.business_name || lead.businessName || "").trim();
  if (!full) return "Hello,";
  const words = full.split(/\s+/);
  const looksLikePerson = words.length >= 2 && words.length <= 4
    && !full.includes("&")
    && !/\d/.test(full)
    && words.every((w) => /^[A-Za-z][A-Za-z.'-]*$/.test(w))
    && !/\b(ltd|limited|llc|llp|inc|corp|corporation|co\.?|company|group|gmbh|pty|plc|sa|sarl|bv|clinic|dental|hospital|studio|agency|enterprise|services|solutions|care|center|centre)\b/i.test(full);
  return looksLikePerson ? `Hi ${words[0]},` : "Hello,";
}

/** Evidence-based one-liner. NEVER a claim not present in lead data;
 *  when nothing is known we ask a question instead of asserting. */
function provableLine(lead: any): string {
  return resolvePoint1(lead);
}

/** Render the exact email for a lead + follow-up number. Never fabricates. */
export async function buildOutreachEmail(lead: any, followUpNumber = 0): Promise<{ subject: string; html: string; text: string; data: Record<string, string> }> {
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
  if (!data.challenge) data.challenge = "I'd love to learn where manual work slows your team down most";
  // ---- premium personalization (computed from real lead data only) ----
  data.firstName = greetingFor(lead).replace(/^Hi\s*/, "").replace(/,$/, "");
  data.greeting = greetingFor(lead);
  const ind = (data.industry || "").trim();
  data.industry_phrase = ind ? `similar ${ind} businesses` : "businesses like yours";
  const city = String(data.city || "").trim();
  const country = String(data.country || "").trim();
  const cityCountry = city
    ? (country && city.toLowerCase() !== country.toLowerCase() ? `${city}, ${country}` : city)
    : "";
  data.cityCountry = cityCountry ? ` in ${cityCountry}` : "";
  // ---- PER-LEAD PERSONAL POINTS (real data only; see ./personalize) ----
  data.point1 = resolvePoint1(lead);   // the lead's own biggest challenge (or honest question)
  data.point2 = resolvePoint2(lead);   // website observation ("" → paragraph auto-dropped)
  // lowercase-first variant for "caught my eye: …" contexts (keeps I/It/We/The… capital)
  data.point1_lc = /^(I|I'?m|I'?d|We|It|This|The|A|Many|Most|Our)\b/i.test(data.point1)
    ? data.point1
    : data.point1.charAt(0).toLowerCase() + data.point1.slice(1);
  data.provable = data.point1;         // legacy template variable
  const preheader = (data.point1 + " " + String(data.services || "")).replace(/<[^>]+>/g, "").slice(0, 110);
  const subject = renderTemplate(tpl.subject, data);
  let inner = renderTemplate(tpl.body, data, { html: true });
  // drop paragraphs left empty by missing optional points (e.g. {{point2}})
  inner = inner.replace(/<p\b[^>]*>(?:&nbsp;|\s|[.\,\!\?\-\u2013\u2014])*<\/p>/gi, "");
  const html = renderOutreachHtml({ subject, preheader: preheader || data.company || "", innerHtml: inner, industry: ind || null });
  const text = inner.replace(/<[^>]+>/g, " ").replace(/&[a-zA-Z]+;/g, " ").replace(/\s+/g, " ").trim();
  return { subject, html, text, data };
}

// ---------------------------------------------------------------------------
// REFRESH — re-render ALL pending outreach emails with the current template
// + premium shell. Template edits (admin) or lead enrichment apply to emails
// that have not been sent yet. Idempotent: pending rows only.
// ---------------------------------------------------------------------------
export async function refreshPendingOutreachEmails(): Promise<{ refreshed: number }> {
  const rows = await pool.query(
    `SELECT q.id AS qid, q.lead_id, q.template_data, q.status
     FROM email_queue q
     WHERE q.status = 'pending' AND q.email_type = 'outreach'
       AND q.template_data->>'outreach_event_id' IS NOT NULL`
  );
  // template stamps: skip rows already rendered from the CURRENT template revision
  const tplRes = await pool.query(
    `SELECT email_type, updated_at FROM email_templates WHERE email_type IN ('outreach-intro','outreach-followup-1','outreach-followup-2')`
  );
  const stampByType: Record<string, string> = {};
  for (const t of tplRes.rows) stampByType[t.email_type] = new Date(t.updated_at).getTime() + "|premium3";
  let refreshed = 0;
  for (const row of rows.rows) {
    const td = row.template_data || {};
    const fn = Number(td.followUpNumber || 0);
    const type = fn === 0 ? "outreach-intro" : fn === 1 ? "outreach-followup-1" : "outreach-followup-2";
    const stamp = stampByType[type];
    if (stamp && td.tpl_stamp === stamp && String(td.html || "").startsWith("<!doctype html>")) continue;
    const leadId = Number(row.lead_id);
    if (!leadId) continue;
    const leadRes = await pool.query(`SELECT * FROM leads WHERE id = $1`, [leadId]);
    if ((leadRes.rowCount ?? 0) === 0) continue;
    const lead = leadRes.rows[0];
    const built = await buildOutreachEmail(lead, fn);
    const eventId = Number(td.outreach_event_id);
    if (eventId) {
      await pool.query(
        `UPDATE outreach_events SET subject = $2, body = $3 WHERE id = $1 AND status = 'queued'`,
        [eventId, built.subject, built.html]
      );
    }
    await pool.query(
      `UPDATE email_queue SET template_data = template_data || $2::jsonb WHERE id = $1 AND status = 'pending'`,
      [row.qid, JSON.stringify({ subject: built.subject, html: built.html, text: built.text, tpl_stamp: stamp || null })]
    );
    refreshed++;
  }
  return { refreshed };
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
     ORDER BY l.contact_priority ASC NULLS LAST, l.lead_score DESC, l.id DESC
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
  await ensureOutreachSchema(); // reply_received column may not exist yet on fresh DBs
  await ensureOutreachTemplates();
  const days = cfg.follow_up_days.length ? cfg.follow_up_days : [3, 7];
  let scheduled = 0;
  for (let n = 0; n < days.length; n++) {
    // Follow-up (n+1) fires `days[n]` days AFTER THE INTRO EMAIL was sent —
    // matches the spec: Email 1 → Day 0, Follow-up 1 → Day 3, Follow-up 2 → Day 7.
    const r = await pool.query(
      `SELECT e.* FROM outreach_events e
       JOIN leads l ON l.id = e.lead_id
       JOIN outreach_events e0 ON e0.lead_id = e.lead_id AND e0.follow_up_number = 0
            AND e0.status = 'sent' AND e0.test_send = false
       WHERE e.follow_up_number = $1 AND e.status = 'sent' AND e.test_send = false
         AND e0.sent_at + ($2::text || ' days')::interval <= now()
         AND COALESCE(l.status, 'active') NOT IN (${BLOCKED_STATUSES.map((_, i) => `$${i + 3}`).join(",")})
         AND COALESCE(l.reply_received, false) = false
         AND NOT EXISTS (SELECT 1 FROM outreach_events e2 WHERE e2.lead_id = e.lead_id AND e2.follow_up_number = $1 + 1)
       LIMIT 100`,
      [n, days[n], ...BLOCKED_STATUSES]
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
      console.log(`[SEND] FOLLOWUP_SCHEDULED lead=${ev.lead_id} followup=${n + 1} due_after_day=${days[n]}`);
    }
  }
  return scheduled;
}

// Pre-send MX check: skip dead domains without spending sender reputation.
// Only a DEFINITIVE no-mx fails; DNS flakes/timeouts pass through (we never
// block a real send on a flaky lookup — the provider bounce path still catches).
async function domainHasMx(email: string): Promise<"ok" | "bad" | "unknown"> {
  const domain = String(email || "").split("@")[1]?.trim().toLowerCase();
  if (!domain || !domain.includes(".")) return "bad";
  try {
    const mxs = await Promise.race([
      dns.resolveMx(domain),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("mx-timeout")), 3000)),
    ]);
    return mxs && mxs.length ? "ok" : "bad";
  } catch (e: any) {
    const code = String(e?.code || e?.message || "");
    if (/ENOTFOUND|ENODATA|EBADNAME/i.test(code)) return "bad";
    return "unknown";
  }
}

// ---------------------------------------------------------------------------
// SEND — controlled, rate-limited, limit-capped, test-mode aware
// ---------------------------------------------------------------------------
export async function processOutreachQueue(cfg: OutreachConfig): Promise<{ sent: number; failed: number; skipped: number; capped: boolean; truncated: boolean; batchCap: number; testMode: boolean }> {
  await ensureOutreachSchema();
  const rows = await pool.query(
    `SELECT q.* FROM email_queue q
     WHERE q.status = 'pending' AND q.scheduled_for <= now()
       AND q.template_data->>'outreach_event_id' IS NOT NULL
     ORDER BY (q.template_data->>'followUpNumber')::int DESC NULLS LAST, q.scheduled_for, q.id
     LIMIT 200`
  );

  // ---- CRASH RECOVERY: an invocation that claimed an event ('sending') and
  // died before marking it sent/failed would block that email forever. Reset
  // stale claims (older than 30 min) so the next tick retries them. The
  // residual duplicate risk (email delivered but crash before DB write) is
  // limited to this narrow window and is logged.
  const stale = await pool.query(
    `UPDATE outreach_events SET status = 'queued', claim_started_at = NULL
     WHERE status = 'sending' AND claim_started_at < now() - interval '30 minutes'
     RETURNING id`
  );
  if ((stale.rowCount ?? 0) > 0) console.log(`[SEND] CRASH_RECOVERY re-queued ${stale.rowCount} stale sending event(s): ${stale.rows.map((r: any) => r.id).join(",")}`);

  let sentToday = 0;
  if (!cfg.test_mode) {
    const c = await pool.query(`SELECT count(*)::int n FROM outreach_events WHERE status = 'sent' AND test_send = false AND sent_at::date = CURRENT_DATE`);
    sentToday = c.rows[0]?.n || 0;
  }
  const remaining = cfg.test_mode ? rows.rows.length : Math.max(0, cfg.daily_limit - sentToday);
  // ---- serverless safety: ALWAYS finish inside the function window ----
  // Vercel Hobby kills functions at 60s (default even sooner). A full queue
  // at 20s gaps would exceed that, so each invocation only takes a bounded
  // slice; the queue is stateful (pending -> sent/failed), so the next tick
  // (cron 02:00 + 3 engine hooks/day, or manual Run now) simply continues.
  const BATCH_CAP = Math.max(1, Number.parseInt(process.env.OUTREACH_MAX_BATCH || "8", 10) || 8);
  const TIME_BUDGET_MS = 45_000;
  const loopStart = Date.now();
  const batch = (rows.rows as any[]).slice(0, Math.min(remaining, BATCH_CAP));
  const capped = rows.rows.length > batch.length;

  let sent = 0, failed = 0, skipped = 0, truncated = false;
  let lastSendAt = 0;
  const gap = cfg.min_gap_secs * 1000;
  for (const row of batch) {
    if (Date.now() - loopStart > TIME_BUDGET_MS) { truncated = true; break; }
    const data = row.template_data || {};
    const eventId = Number(data.outreach_event_id);

    // ================= TEST MODE = dry run =================
    // Deliver to the test recipient but NEVER mutate event/queue state: the
    // same rows stay pending so the REAL send to the lead still happens once
    // test mode is switched off. A test send must never consume a lead.
    if (cfg.test_mode) {
      const result = await sendEmail({ to: cfg.test_recipient, subject: data.subject || "Vyravo AI", html: data.html, replyTo: DEFAULT_REPLY_TO });
      if (result.sent) sent++; else failed++;
      continue;
    }
    // ================= PRODUCTION send =================
    const leadId = Number(data.leadId || 0);
    // FRESH CHECK (immediately before sending — never rely on when the
    // follow-up was scheduled): if the lead replied or is closed, do not send.
    if (leadId) {
      const lead = await pool.query(`SELECT status, reply_received FROM leads WHERE id = $1`, [leadId]);
      if ((lead.rowCount ?? 0) === 0) {
        await pool.query(`UPDATE email_queue SET status = 'skipped' WHERE id = $1`, [row.id]);
        await pool.query(`UPDATE outreach_events SET status = 'cancelled' WHERE id = $1`, [eventId]);
        skipped++;
        continue;
      }
      if (lead.rows[0].reply_received || BLOCKED_STATUSES.includes(String(lead.rows[0].status))) {
        await pool.query(`UPDATE email_queue SET status = 'skipped' WHERE id = $1`, [row.id]);
        await pool.query(`UPDATE outreach_events SET status = 'cancelled' WHERE id = $1 AND status = 'queued'`, [eventId]);
        skipped++;
        console.log(`[SEND] FOLLOWUP_SKIPPED_REPLY lead=${leadId} event=${eventId} queue=${row.id} status=${lead.rows[0].status} reply=${lead.rows[0].reply_received}`);
        continue;
      }
    }
    // duplicate/concurrency protection: ATOMIC claim — only one worker can own
    // the send. A second invocation sees status != 'queued' and skips.
    const claim = await pool.query(
      `UPDATE outreach_events SET status = 'sending', claim_started_at = now() WHERE id = $1 AND status = 'queued' RETURNING id`,
      [eventId]
    );
    if ((claim.rowCount ?? 0) === 0) {
      await pool.query(`UPDATE email_queue SET status = 'skipped' WHERE id = $1`, [row.id]);
      skipped++;
      console.log(`[SEND] DUPLICATE_EVENT_IGNORED event=${eventId} queue=${row.id} — already claimed/sent by another run`);
      continue;
    }
    const to = String(data.to || "");
    if (!to || !EMAIL_RE.test(to)) {
      await pool.query(`UPDATE email_queue SET status = 'failed', template_data = template_data || '{"error":"invalid recipient"}'::jsonb WHERE id = $1`, [row.id]);
      await pool.query(`UPDATE outreach_events SET status = 'failed', error_message = 'invalid recipient', failed_at = now() WHERE id = $1`, [eventId]);
      failed++;
      continue;
    }
    if ((await domainHasMx(to)) === "bad") {
      await pool.query(`UPDATE email_queue SET status = 'failed', template_data = template_data || '{"error":"no mail server (MX)"}'::jsonb WHERE id = $1`, [row.id]);
      await pool.query(`UPDATE outreach_events SET status = 'failed', error_message = 'no mail server (MX)', failed_at = now() WHERE id = $1`, [eventId]);
      failed++;
      console.log(`[SEND] MX_SKIP lead=${leadId} event=${eventId} queue=${row.id} to=${to} — domain has no mail server`);
      continue;
    }
    // min gap between sends
    if (sent + failed > 0 && gap > 0) {
      const wait = Math.max(0, gap - (Date.now() - lastSendAt));
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    lastSendAt = Date.now();
    const result = await sendEmail({ to, subject: data.subject || "Vyravo AI", html: data.html, replyTo: DEFAULT_REPLY_TO });
    if (result.sent) {
      await pool.query(`UPDATE email_queue SET status = 'sent', sent_at = now() WHERE id = $1`, [row.id]);
      await pool.query(
        `UPDATE outreach_events SET status = 'sent', sent_at = now(), resend_id = $2, test_send = false WHERE id = $1`,
        [eventId, (result as any).id || null]
      );
      if (leadId) {
        const fn = Number(data.followUpNumber || 0);
        const delay = nextFollowUpDelay(cfg.follow_up_days, fn);
        // NEW -> CONTACTED on first outreach; outreach_started_at once;
        // follow_up_count tracks the highest follow-up number sent.
        await pool.query(
          `UPDATE leads SET
             status = CASE WHEN status IN ('new','active') THEN 'contacted' ELSE status END,
             last_contacted_at = now(),
             next_follow_up = $2,
             outreach_started_at = COALESCE(outreach_started_at, now()),
             follow_up_count = GREATEST(follow_up_count, $3)
           WHERE id = $1`,
          [leadId, delay != null ? new Date(Date.now() + delay * 86400000) : null, fn]
        );
      }
      sent++;
      console.log(`[SEND] EMAIL_SENT lead=${leadId} event=${eventId} queue=${row.id} followup=${data.followUpNumber || 0} provider=${result.provider} id=${String((result as any).id || "").slice(0, 48)}`);
    } else {
      await pool.query(`UPDATE email_queue SET status = 'failed' WHERE id = $1`, [row.id]);
      await pool.query(
        `UPDATE outreach_events SET status = 'failed', error_message = $2, failed_at = now() WHERE id = $1`,
        [eventId, String(result.error || "send failed").slice(0, 500)]
      );
      failed++;
      console.log(`[SEND] EMAIL_FAILED lead=${leadId} event=${eventId} queue=${row.id} provider=${result.provider} error=${String(result.error || "").slice(0, 120)}`);
    }
  }
  return { sent, failed, skipped, capped, truncated, batchCap: BATCH_CAP, testMode: cfg.test_mode };
}

/** Days from NOW until the next scheduled email, after follow-up number `fn`
 *  was sent — null when no further follow-ups remain. */
export function nextFollowUpDelay(days: number[], fn: number): number | null {
  if (fn < 0 || fn >= days.length) return null;
  if (fn === 0) return days[0];
  return Math.max(1, days[fn] - days[fn - 1]);
}

// ---------------------------------------------------------------------------
// MANUAL CONTROLS (keep the human in charge)
// ---------------------------------------------------------------------------
export async function sendOutreachNow(leadId: number): Promise<{ ok: boolean; error?: string; to?: string; testMode?: boolean }> {
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

  // TEST MODE: deliver to the test recipient only — the event stays queued so
  // the real send to the lead still happens when test mode is switched off.
  if (cfg.test_mode) {
    const t = await sendEmail({ to: cfg.test_recipient, subject: event.subject, html: event.body, replyTo: DEFAULT_REPLY_TO });
    return t.sent ? { ok: true, to: cfg.test_recipient, testMode: true } : { ok: false, error: t.error || "Send failed" };
  }

  const to = email;
  const result = await sendEmail({ to, subject: event.subject, html: event.body, replyTo: DEFAULT_REPLY_TO });
  if (result.sent) {
    await pool.query(
      `UPDATE outreach_events SET status = 'sent', sent_at = now(), resend_id = $2, test_send = false WHERE id = $1`,
      [event.id, (result as any).id || null]
    );
    const delay = nextFollowUpDelay(cfg.follow_up_days, Number(event.follow_up_number || 0));
    await pool.query(
      `UPDATE leads SET
         status = CASE WHEN status IN ('new','active') THEN 'contacted' ELSE status END,
         last_contacted_at = now(),
         next_follow_up = $1,
         outreach_started_at = COALESCE(outreach_started_at, now()),
         follow_up_count = GREATEST(follow_up_count, $2)
       WHERE id = $3`,
      [delay != null ? new Date(Date.now() + delay * 86400000) : null, Number(event.follow_up_number || 0), leadId]
    );
    console.log(`[SEND] EMAIL_SENT lead=${leadId} event=${event.id} followup=${event.follow_up_number || 0} provider=${result.provider} id=${String((result as any).id || "").slice(0, 48)}`);
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

export interface ReplyMeta { messageId?: string | null; subject?: string | null; preview?: string | null; }

/**
 * Mark a lead as replied + stop its entire follow-up chain.
 * IDEMPOTENT: when meta.messageId is given, the message-id is recorded in
 * outreach_replies_seen FIRST — a duplicate event (provider retry, cron
 * retry, Vercel retry) is ignored and reported as "duplicate".
 * Returns "applied" | "duplicate" | "missing".
 */
export async function markReplied(leadId: number, meta: ReplyMeta = {}): Promise<"applied" | "duplicate" | "missing"> {
  await ensureOutreachSchema();
  const normId = meta.messageId ? normalizeMessageId(meta.messageId) : null;
  if (normId) {
    const seen = await pool.query(
      `INSERT INTO outreach_replies_seen (message_id, lead_id) VALUES ($1, $2)
       ON CONFLICT (message_id) DO NOTHING RETURNING message_id`,
      [normId, leadId]
    );
    if ((seen.rowCount ?? 0) === 0) {
      console.log(`[REPLY] DUPLICATE_EVENT_IGNORED lead=${leadId} msg=${String(normId).slice(0, 60)}`);
      return "duplicate";
    }
  }
  const lead = await pool.query(`SELECT id, status FROM leads WHERE id = $1`, [leadId]);
  if ((lead.rowCount ?? 0) === 0) return "missing";
  const firstReply = String(lead.rows[0].status || "") !== "replied";

  await pool.query(
    `UPDATE leads SET
        reply_received = true,
        status = 'replied',
        replied_at = COALESCE(replied_at, now()),
        last_inbound_email_at = now(),
        latest_reply_message_id = COALESCE($2, latest_reply_message_id),
        latest_reply_subject = COALESCE($3, latest_reply_subject),
        latest_reply_preview = COALESCE($4, latest_reply_preview),
        next_follow_up = NULL
     WHERE id = $1`,
    [leadId, String(normId || "").slice(0, 255) || null, (meta.subject || "").slice(0, 300) || null, (meta.preview || "").slice(0, 500) || null]
  );
  // stop the follow-up chain: queued/'sending' events → cancelled, queue rows → skipped
  await pool.query(`UPDATE outreach_events SET status = 'cancelled' WHERE lead_id = $1 AND status IN ('queued','sending')`, [leadId]);
  await pool.query(
    `UPDATE email_queue SET status = 'skipped'
     WHERE lead_id = $1 AND status = 'pending' AND template_data->>'outreach_event_id' IS NOT NULL`,
    [leadId]
  );
  try {
    await pool.query(
      `INSERT INTO activities (type, action, description, lead_id, created_at)
       VALUES ('lead', 'replied', $2, $1, now())`,
      [leadId, firstReply ? `Lead replied — follow-ups cancelled${meta.subject ? ` ("${String(meta.subject).slice(0, 80)}")` : ""}` : "Duplicate reply event ignored for lead"]
    );
  } catch { /* activities table may not exist on some installs — non-fatal */ }

  console.log(`[REPLY] REPLY_RECEIVED lead=${leadId} first=${firstReply} msg=${String(normId || "").slice(0, 60)}`);
  if (firstReply) {
    console.log(`[REPLY] REPLY_MATCHED_TO_LEAD lead=${leadId} — follow-ups cancelled, status=replied`);
    // speed-to-lead: ping the owner immediately (fire-and-forget, never blocks)
    try {
      const to = (process.env.REPORT_EMAIL || process.env.EMAIL_USER || "").trim();
      if (to) {
        const esc = (s: any) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").slice(0, 400);
        const lr = await pool.query(`SELECT business_name, email, lead_score FROM leads WHERE id = $1`, [leadId]);
        const nm = lr.rows[0]?.business_name || `lead ${leadId}`;
        await sendEmail({
          to,
          subject: `🔥 Reply: ${nm}`,
          html: `<p><b>${esc(nm)}</b> (${esc(lr.rows[0]?.email)}, score ${lr.rows[0]?.lead_score ?? ""}) just replied.</p><p><b>Subject:</b> ${esc(meta.subject)}</p><p>${esc(meta.preview)}</p>`,
          replyTo: DEFAULT_REPLY_TO,
        });
        console.log(`[REPLY] OWNER_ALERT_SENT lead=${leadId} to=${to}`);
      }
    } catch (e) { console.error("reply owner-alert failed (non-fatal):", e); }
  }
  return "applied";
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
    replies: await one(`SELECT count(*)::int n FROM leads WHERE status = 'replied' OR reply_received = true`),
    followupsDue: await one(`SELECT count(*)::int n FROM outreach_events WHERE status = 'queued' AND follow_up_number > 0`),
    sentToday: await one(`SELECT count(*)::int n FROM outreach_events WHERE status = 'sent' AND sent_at::date = CURRENT_DATE AND test_send = false`),
    auto: (await getOutreachConfig()).auto_outreach,
    test: (await getOutreachConfig()).test_mode,
  };

  const list = await pool.query(
    `SELECT e.id, e.lead_id, e.recipient_email, e.subject, e.status, e.error_message, e.follow_up_number,
            e.queued_at, e.sent_at, e.failed_at, e.delivered_at, e.test_send,
            l.full_name, l.business_name, l.lead_score, l.status AS lead_status,
            l.reply_received, l.replied_at, l.latest_reply_subject, l.latest_reply_preview,
            l.follow_up_count, l.outreach_started_at
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

  const refreshed = await refreshPendingOutreachEmails(); // apply template edits + premium shell to pending
  const gen = await generateAndQueue(cfg);
  const followups = await scheduleFollowUps(cfg);

  // ---- INBOUND REPLIES: check the mailbox BEFORE sending anything, so a
  // reply that arrived minutes ago stops the follow-up chain immediately. ----
  let replyPoll: any = { polled: 0, matched: 0, applied: 0, reason: "skipped" };
  let backfill: any = { backfilled: 0 };
  try {
    const { pollGmailReplies, backfillSentMessageIds } = await import("./replies");
    replyPoll = await pollGmailReplies();
    backfill = await backfillSentMessageIds();
  } catch (e: any) {
    replyPoll = { ...replyPoll, errors: 1, reason: String(e?.message || e).slice(0, 200) };
    console.error("[REPLY] poll/backfill crashed (pipeline continues):", String(e?.message || e).slice(0, 200));
  }

  let sendResult: any = null;
  // auto-send only when AUTO OUTREACH is ON (test mode still respected)
  if (opts.send && cfg.auto_outreach) {
    sendResult = await processOutreachQueue(cfg);
  }
  return {
    cfg: { auto: cfg.auto_outreach, test: cfg.test_mode, dailyLimit: cfg.daily_limit },
    pendingRefreshed: refreshed.refreshed,
    newQueued: gen.queued, skipped: gen.skipped, followupsScheduled: followups,
    repliesScanned: replyPoll.polled, repliesApplied: replyPoll.applied, repliesMatched: replyPoll.matched,
    replyPollError: replyPoll.reason || null, messageIdsBackfilled: backfill.backfilled || 0,
    sendResult,
  };
}
