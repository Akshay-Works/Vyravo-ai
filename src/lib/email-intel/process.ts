// ============================================================================
// EMAIL INTELLIGENCE — sync + processing tick. Reuses: IMAP poll loop (sync
// hook), deterministic classifier (Tier-0 safety), sendEmail, leads,
// activities, doNotContact. Bounded per tick for the 60s serverless window;
// state is DB-backed so the next tick simply continues.
// ============================================================================
import { pool } from "@/db";
import { ensureInboxSchema, auditInbox, getInboxConfig } from "./schema";
import {
  threadRoot, extractFullText, splitAddr, splitAddrList, isSystemAddress,
  extractEmails, extractPhones, extractLinkedIns,
} from "./extract";
import { analyzeEmail, type IntelAnalysis, type IntelEntity } from "./llm";
import { decideAction } from "./safety";
import { classifyReply } from "@/lib/activity/classify";
import { sendEmail, DEFAULT_REPLY_TO } from "@/lib/email/send";
import { doNotContact } from "@/lib/outreach/pipeline";

const OUR_SENDERS = () =>
  [process.env.ADMIN_REPLY_TO, process.env.EMAIL_USER, process.env.GMAIL_IMAP_USER,
    "akshay.navale.work@gmail.com", "onboarding@resend.dev"]
    .filter(Boolean).map((s) => String(s).toLowerCase());

// ---------------------------------------------------------------------------
// SYNC — persist one matched inbound reply (called from the IMAP poll loop,
// BEFORE markReplied so outreach_replies_seen tells pre-system mail apart).
// ---------------------------------------------------------------------------
export interface SyncInput {
  messageId: string; threadIds: string[]; leadId: number;
  fromHeader: string; toHeader: string; ccHeader: string;
  subject: string; source: string; date?: string | null;
}

export async function syncInboundMessage(m: SyncInput): Promise<{ synced: boolean; reason?: string }> {
  await ensureInboxSchema();
  const from = splitAddr(m.fromHeader);
  if (!from.email) return { synced: false, reason: "no from" };
  if (OUR_SENDERS().includes(from.email)) return { synced: false, reason: "own address" };
  try {
    const seen = await pool.query(`SELECT 1 FROM outreach_replies_seen WHERE message_id = $1`, [m.messageId]);
    if ((seen.rowCount ?? 0) > 0) return { synced: false, reason: "pre-system mail" };
    const ins = await pool.query(
      `INSERT INTO inbox_messages
         (message_id, thread_id, lead_id, direction, from_email, from_name, to_emails, cc_emails,
          subject, body_text, sent_at, status)
       VALUES ($1, $2, $3, 'in', $4, $5, $6, $7, $8, $9, $10, 'new')
       ON CONFLICT (message_id) DO NOTHING RETURNING id`,
      [m.messageId, threadRoot(m.threadIds, m.messageId), m.leadId, from.email, from.name,
       splitAddrList(m.toHeader), splitAddrList(m.ccHeader),
       String(m.subject || "").slice(0, 500), extractFullText(m.source),
       m.date ? new Date(m.date) : new Date()]
    );
    if ((ins.rowCount ?? 0) === 0) return { synced: false, reason: "duplicate" };
    await auditInbox({ message_id: m.messageId, thread_id: threadRoot(m.threadIds, m.messageId), lead_id: m.leadId, action: "synced", detail: { from: from.email, subject: String(m.subject || "").slice(0, 120) } });
    return { synced: true };
  } catch (e: any) {
    console.error("inbox sync failed (non-fatal):", String(e?.message || e).slice(0, 160));
    return { synced: false, reason: "error" };
  }
}

// ---------------------------------------------------------------------------
// TICK — claim + process a bounded batch of new messages.
// ---------------------------------------------------------------------------
export interface TickOpts { maxMessages?: number; budgetMs?: number; forceDraft?: boolean }
export interface TickSummary {
  claimed: number; sent: number; drafted: number; review: number;
  ignored: number; unsubscribed: number; failed: number; truncated: boolean;
}

export async function processInboxTick(opts: TickOpts = {}): Promise<TickSummary> {
  const max = Math.min(Math.max(opts.maxMessages || 8, 1), 25);
  const budget = opts.budgetMs || 20000;
  const t0 = Date.now();
  const sum: TickSummary = { claimed: 0, sent: 0, drafted: 0, review: 0, ignored: 0, unsubscribed: 0, failed: 0, truncated: false };
  await ensureInboxSchema();
  const cfg = await getInboxConfig();
  const claim = await pool.query(
    `UPDATE inbox_messages SET status = 'processing', processed_at = now()
     WHERE id IN (SELECT id FROM inbox_messages WHERE status = 'new' ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED)
     RETURNING *`, [max]);
  sum.claimed = claim.rowCount ?? 0;
  for (const msg of claim.rows as any[]) {
    if (Date.now() - t0 > budget) { sum.truncated = true; break; }
    try {
      const action = await processOne(msg, cfg, !!opts.forceDraft);
      // Sales OS: pipeline decision (stage move / escalation) for every processed message.
      try {
        const { decideForInbox } = await import("@/lib/sales/decide");
        const fresh = (await pool.query(`SELECT lead_id, classification, confidence FROM inbox_messages WHERE id = $1`, [msg.id])).rows[0];
        if (fresh) await decideForInbox({ lead_id: fresh.lead_id, classification: fresh.classification, confidence: fresh.confidence, actionTaken: action });
      } catch { /* decision failure must never break the tick */ }
      if (action === "send") sum.sent++;
      else if (action === "draft") sum.drafted++;
      else if (action === "needs_review") sum.review++;
      else if (action === "ignore" || action === "no_reply") sum.ignored++;
      else if (action === "unsubscribe") sum.unsubscribed++;
    } catch (e: any) {
      sum.failed++;
      await pool.query(`UPDATE inbox_messages SET status = 'failed', error_message = $2 WHERE id = $1`,
        [msg.id, String(e?.message || e).slice(0, 400)]);
      await auditInbox({ message_id: msg.message_id, thread_id: msg.thread_id, lead_id: msg.lead_id, action: "failed", detail: { error: String(e?.message || e).slice(0, 200) } });
    }
  }
  try { await checkFollowUpDue(); } catch {}
  return sum;
}

async function threadContext(msg: any): Promise<{ prior: string; leadFacts: Record<string, string>; lead: any }> {
  let lead: any = null;
  if (msg.lead_id) {
    const r = await pool.query(`SELECT * FROM leads WHERE id = $1`, [msg.lead_id]);
    lead = r.rows[0] || null;
  }
  const parts: string[] = [];
  if (msg.lead_id) {
    const sent = await pool.query(
      `SELECT subject, body FROM outreach_events WHERE lead_id = $1 AND status = 'sent' ORDER BY sent_at DESC LIMIT 2`, [msg.lead_id]);
    for (const s of [...sent.rows].reverse()) {
      const txt = String(s.body || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 450);
      parts.push(`OUTBOUND (us, ${String(s.subject || "").slice(0, 80)}): ${txt}`);
    }
  }
  const thread = await pool.query(
    `SELECT direction, from_email, subject, body_text FROM inbox_messages
     WHERE thread_id = $1 AND id != $2 ORDER BY id ASC LIMIT 5`, [msg.thread_id, msg.id]);
  for (const t of thread.rows) {
    parts.push(`${t.direction === "out" ? "OUTBOUND (us)" : `INBOUND from ${t.from_email}`}: ${String(t.body_text || "").slice(0, 450)}`);
  }
  const leadFacts: Record<string, string> = {};
  if (lead) {
    if (lead.business_name) leadFacts.company = String(lead.business_name).slice(0, 120);
    if (lead.industry) leadFacts.industry = String(lead.industry).slice(0, 80);
    if (lead.city || lead.country) leadFacts.location = [lead.city, lead.country].filter(Boolean).join(", ").slice(0, 80);
    if (lead.recommended_services) leadFacts.services = String(lead.recommended_services).slice(0, 200);
    if (lead.biggest_challenge) leadFacts.challenge = String(lead.biggest_challenge).slice(0, 200);
    const nm = lead.full_name || lead.business_name || "";
    if (nm && !/^[0-9\s]+$/.test(String(nm))) leadFacts.name = String(nm).slice(0, 80);
  }
  return { prior: parts.join("\n---\n").slice(0, 2200), leadFacts, lead };
}

async function processOne(msg: any, cfg: Awaited<ReturnType<typeof getInboxConfig>>, forceDraft: boolean): Promise<string> {
  const { prior, leadFacts, lead } = await threadContext(msg);
  const tier0 = classifyReply(msg.subject, String(msg.body_text || "").slice(0, 2000)).class;

  const pref = await pool.query(`SELECT auto_reply FROM inbox_thread_prefs WHERE thread_id = $1`, [msg.thread_id]);
  const threadAutoOn = pref.rows[0]?.auto_reply !== false;
  const sentToday = Number((await pool.query(
    `SELECT count(*)::int n FROM inbox_messages WHERE direction = 'out' AND status = 'sent' AND processed_at::date = CURRENT_DATE`)).rows[0]?.n || 0);
  const threadSent7d = Number((await pool.query(
    `SELECT count(*)::int n FROM inbox_messages WHERE direction = 'out' AND status = 'sent' AND thread_id = $1 AND processed_at > now() - interval '7 days'`, [msg.thread_id])).rows[0]?.n || 0);

  // Terminal Tier-0 outcomes skip the LLM entirely (same result, zero cost).
  const skipLLM = tier0 === "unsubscribe" || tier0 === "out_of_office" || tier0 === "not_interested";
  const llm: IntelAnalysis | null = skipLLM ? null : await analyzeEmail({
    fromEmail: msg.from_email, fromName: msg.from_name,
    subject: msg.subject || "", body: String(msg.body_text || "").slice(0, 3200),
    priorThread: prior, leadFacts,
  });
  // Guarantee: regex-extracted emails the LLM missed still get stored.
  if (llm) {
    const have = new Set(llm.entities.map((e) => e.email));
    for (const em of extractEmails(`${msg.subject} ${msg.body_text}`)) {
      if (em !== msg.from_email && !have.has(em)) {
        llm.entities.push({ email: em, name: null, title: null, company: null, phone: null, linkedin: null, relationship: null, reason: "mentioned in message (regex fallback)", confidence: 0.5, recommended_action: "review" });
      }
    }
  }

  const decision = decideAction({
    tier0, llm, autoReplyOn: cfg.auto_reply, threadAutoOn,
    sentToday, dailyCap: cfg.daily_cap, threadAutoSent7d: threadSent7d,
    minConf: cfg.min_conf, reviewAt: cfg.review_at,
    recipientKnown: !!msg.from_email, isSelf: OUR_SENDERS().includes(String(msg.from_email).toLowerCase()),
  });
  let action = decision.action;
  if (forceDraft && action === "send") { action = "draft"; decision.reasons.push("production-safe mode: forced draft"); }
  if (action === "send") {
    try {
      const { isSalesPaused } = await import("@/lib/sales/schema");
      const gate = await isSalesPaused();
      if (gate.paused) { action = "draft"; decision.reasons.push(`sales paused — draft only (${gate.reason})`); }
    } catch { /* guard failure: fail open (send), router already approved */ }
  }

  await pool.query(
    `UPDATE inbox_messages SET classification = $2, confidence = $3, reply_required = $4,
        ai_reply_subject = $5, ai_reply_body = $6, ai_confidence = $7, processed_at = now()
     WHERE id = $1`,
    [msg.id, llm?.classification || tier0, llm?.confidence ?? null, llm?.reply_required ?? null,
     llm?.draft?.subject || null, llm?.draft?.body || null, llm?.confidence ?? null]);

  if (action === "unsubscribe") {
    if (msg.lead_id) {
      await doNotContact(Number(msg.lead_id));
      await pool.query(`INSERT INTO activities (type, action, description, lead_id, created_at) VALUES ('lead','unsubscribed',$2,$1,now())`,
        [msg.lead_id, `Unsubscribed via email reply — outreach stopped, no response sent`]).catch(() => {});
    }
    await pool.query(`UPDATE inbox_messages SET status = 'processed' WHERE id = $1`, [msg.id]);
    await auditInbox({ message_id: msg.message_id, thread_id: msg.thread_id, lead_id: msg.lead_id, action: "unsubscribed", detail: { reasons: decision.reasons } });
    return action;
  }
  if (action === "ignore") {
    await pool.query(`UPDATE inbox_messages SET status = 'ignored' WHERE id = $1`, [msg.id]);
    await auditInbox({ message_id: msg.message_id, thread_id: msg.thread_id, lead_id: msg.lead_id, action: "ignored", detail: { class: llm?.classification || tier0, reasons: decision.reasons } });
    return action;
  }
  if (action === "no_reply") {
    if (msg.lead_id) {
      await pool.query(`UPDATE outreach_events SET status = 'cancelled' WHERE lead_id = $1 AND status IN ('queued','sending')`, [msg.lead_id]);
      await pool.query(`UPDATE email_queue SET status = 'skipped' WHERE lead_id = $1 AND status = 'pending' AND template_data->>'outreach_event_id' IS NOT NULL`, [msg.lead_id]);
      await pool.query(`INSERT INTO activities (type, action, description, lead_id, created_at) VALUES ('lead','not_interested',$2,$1,now())`,
        [msg.lead_id, `Not interested via reply — pending outreach cancelled, nothing sent`]).catch(() => {});
    }
    await pool.query(`UPDATE inbox_messages SET status = 'processed' WHERE id = $1`, [msg.id]);
    await auditInbox({ message_id: msg.message_id, thread_id: msg.thread_id, lead_id: msg.lead_id, action: "no_reply", detail: { reasons: decision.reasons } });
    return action;
  }

  // Persist extracted contacts (dedupe-safe) for draft/review/send paths.
  for (const e of llm?.entities || []) {
    await pool.query(
      `INSERT INTO inbox_contacts (message_id, email, name, title, company, phone, linkedin, relationship, reason, confidence, recommended_action, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'new')
       ON CONFLICT (message_id, email) DO NOTHING`,
      [msg.message_id, e.email, e.name || null, e.title || null, e.company || null, e.phone || null,
       e.linkedin || null, e.relationship || null, e.reason || null, e.confidence, e.recommended_action]);
  }

  if (action === "draft" || action === "needs_review") {
    await pool.query(`UPDATE inbox_messages SET status = $2 WHERE id = $1`, [msg.id, action === "draft" ? "reply_generated" : "needs_review"]);
    await auditInbox({ message_id: msg.message_id, thread_id: msg.thread_id, lead_id: msg.lead_id, action, detail: { class: llm?.classification, conf: llm?.confidence, reasons: decision.reasons, explanation: llm?.explanation } });
    return action;
  }

  // ---- SEND ----
  const draft = llm!.draft!;
  const cleanSub = String(draft.subject || "").replace(/^\s*(re:\s*)+/i, "").slice(0, 200) || msg.subject || "Re: your message";
  const html = `<div>${String(draft.body).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").split(/\n{2,}|\r?\n\r?\n/).map((p) => `<p style="margin:0 0 14px;">${p.replace(/\n/g, "<br>")}</p>`).join("")}</div>`;
  const sent = await sendEmail({
    to: msg.from_email, subject: `Re: ${cleanSub}`, html,
    text: draft.body, replyTo: DEFAULT_REPLY_TO,
    headers: { "In-Reply-To": `<${msg.message_id}>`, References: `<${msg.thread_id}> <${msg.message_id}>` },
  });
  if (!sent.sent) throw new Error(`reply send failed: ${sent.error || "unknown"}`);
  await pool.query(
    `INSERT INTO inbox_messages (message_id, thread_id, lead_id, direction, from_email, to_emails, subject, body_text, sent_at, status, sent_message_id, processed_at)
     VALUES ($1,$2,$3,'out',$4,$5,$6,$7,now(),'sent',$8,now())
     ON CONFLICT (message_id) DO NOTHING`,
    [`vyravo-out-${msg.id}-${Date.now()}`, msg.thread_id, msg.lead_id, DEFAULT_REPLY_TO, [msg.from_email], `Re: ${cleanSub}`, draft.body, (sent as any).id || null]);
  const due = new Date(Date.now() + 4 * 86400000);
  await pool.query(`UPDATE inbox_messages SET status = 'sent', sent_message_id = $2, follow_up_due_at = $3 WHERE id = $1`, [msg.id, (sent as any).id || null, due]);
  if (msg.lead_id) {
    await pool.query(`UPDATE leads SET last_contacted_at = now(), next_follow_up = $2 WHERE id = $1`, [msg.lead_id, due]);
    await pool.query(`INSERT INTO activities (type, action, description, lead_id, created_at) VALUES ('lead','auto_replied',$2,$1,now())`,
      [msg.lead_id, `AI reply sent (conf ${(llm!.confidence).toFixed(2)}) — “${cleanSub.slice(0, 80)}”`]).catch(() => {});
  }
  await auditInbox({ message_id: msg.message_id, thread_id: msg.thread_id, lead_id: msg.lead_id, action: "sent", detail: { class: llm!.classification, conf: llm!.confidence, provider: sent.provider } });

  // ---- referral contacts cleared for contact ----
  for (const c of decision.contacts) {
    if (c.action !== "contact") continue;
    try { await contactReferral(msg, lead, c.entity); }
    catch (e: any) {
      await auditInbox({ message_id: msg.message_id, thread_id: msg.thread_id, lead_id: msg.lead_id, action: "referral_failed", detail: { email: c.entity.email, error: String(e?.message || e).slice(0, 200) } });
    }
  }
  return action;
}

/** Create/link the referred lead + send the warm referral-context email. One-off, idempotent. Exported for admin approval flow. */
export async function contactReferral(msg: any, _lead: any, e: IntelEntity): Promise<void> {
  if (isSystemAddress(e.email)) return;
  const already = await pool.query(`SELECT 1 FROM inbox_contacts WHERE lower(email) = $1 AND status = 'contacted' LIMIT 1`, [e.email]);
  if ((already.rowCount ?? 0) > 0) {
    await pool.query(`UPDATE inbox_contacts SET status = 'ignored' WHERE message_id = $1 AND lower(email) = $2`, [msg.message_id, e.email]);
    return; // never contact the same referred person twice
  }
  let leadId: number | null = null;
  const existing = await pool.query(`SELECT id FROM leads WHERE lower(email) = $1 LIMIT 1`, [e.email]);
  if ((existing.rowCount ?? 0) > 0) {
    leadId = Number(existing.rows[0].id);
  } else {
    const referrer = msg.from_name || msg.from_email;
    const nm = (e.name || e.email.split("@")[0]).replace(/[._-]+/g, " ").trim() || "New contact";
    const ins = await pool.query(
      `INSERT INTO leads (full_name, email, business_name, source, stage, status, lead_score, additional_info, created_at)
       VALUES ($1,$2,$3,'referral','new','active',60,$4,now()) RETURNING id`,
      [nm.slice(0, 160), e.email, (e.company || "").slice(0, 160) || null,
       `Referred by ${referrer} (${msg.from_email}) on ${new Date().toISOString().slice(0, 10)} — ${e.reason || e.relationship || "referral"}`.slice(0, 500)]);
    leadId = Number(ins.rows[0].id);
    await pool.query(`INSERT INTO activities (type, action, description, lead_id, created_at) VALUES ('lead','created',$2,$1,now())`,
      [leadId, `Referral discovered from ${referrer} — ${e.reason || ""}`.slice(0, 300)]).catch(() => {});
  }
  const firstName = (e.name || "").split(/\s+/)[0] || "there";
  const referrer = msg.from_name || msg.from_email;
  const subject = `Introduction via ${referrer}`;
  const body =
    `Hi ${firstName},\n\n${referrer} suggested I reach out — ${e.reason || "they thought this could be relevant for you"}. ` +
    `At Vyravo AI we implement practical AI automation for businesses like ${e.company || "yours"} (AI receptionists, automated follow-ups, lead handling), live and working, not demos.\n\n` +
    `Would a 15-minute call be useful? Happy to share 2–3 examples from similar businesses.\n\n— Akshay\nVyravo AI`;
  const html = `<div>${body.replace(/&/g, "&amp;").replace(/</g, "&lt;").split("\n\n").map((p) => `<p style="margin:0 0 14px;">${p.replace(/\n/g, "<br>")}</p>`).join("")}</div>`;
  const sent = await sendEmail({ to: e.email, subject, html, text: body, replyTo: DEFAULT_REPLY_TO });
  if (!sent.sent) throw new Error(sent.error || "referral send failed");
  const due = new Date(Date.now() + 5 * 86400000);
  await pool.query(`UPDATE inbox_contacts SET lead_id = $2, status = 'contacted' WHERE message_id = $1 AND lower(email) = $3`, [msg.message_id, leadId, e.email]);
  await pool.query(`UPDATE leads SET last_contacted_at = now(), next_follow_up = $2 WHERE id = $1`, [leadId, due]);
  await pool.query(`INSERT INTO activities (type, action, description, lead_id, created_at) VALUES ('lead','referral_contacted',$2,$1,now())`,
    [leadId, `Warm referral email sent (via ${referrer})`]).catch(() => {});
  await auditInbox({ message_id: msg.message_id, thread_id: msg.thread_id, lead_id: leadId, action: "referral_sent", detail: { email: e.email, conf: e.confidence, provider: sent.provider } });
}

/**
 * Follow-up intelligence: replies we sent that are now due. If the human
 * answered since → resolved silently. Otherwise → needs_review so a HUMAN
 * decides (never blind auto-follow-ups).
 */
export async function checkFollowUpDue(): Promise<number> {
  const due = await pool.query(
    `SELECT id, message_id, thread_id, lead_id FROM inbox_messages
     WHERE status = 'sent' AND direction = 'in' AND follow_up_due_at IS NOT NULL AND follow_up_due_at <= now()
     LIMIT 25`);
  let n = 0;
  for (const m of due.rows as any[]) {
    const answered = await pool.query(
      `SELECT 1 FROM inbox_messages WHERE thread_id = $1 AND direction = 'in' AND id > $2 LIMIT 1`, [m.thread_id, m.id]);
    if ((answered.rowCount ?? 0) > 0) {
      await pool.query(`UPDATE inbox_messages SET follow_up_due_at = NULL WHERE id = $1`, [m.id]);
      await auditInbox({ message_id: m.message_id, thread_id: m.thread_id, lead_id: m.lead_id, action: "followup_resolved", detail: { reason: "human replied" } });
    } else {
      await pool.query(`UPDATE inbox_messages SET status = 'needs_review', follow_up_due_at = NULL WHERE id = $1`, [m.id]);
      await auditInbox({ message_id: m.message_id, thread_id: m.thread_id, lead_id: m.lead_id, action: "followup_due", detail: { reason: "no response in 4d — human decides" } });
      n++;
    }
  }
  return n;
}
