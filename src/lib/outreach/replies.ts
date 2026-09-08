// ============================================================================
// INBOUND REPLY DETECTION — Gmail IMAP poller (matches the ACTUAL provider).
//
// BACKGROUND: outreach emails are sent via Gmail SMTP (no Resend key), and
// Gmail SMTP emits no delivery/reply webhooks. Replies arrive in the Gmail
// inbox. Gmail's own SMTP account can be read via IMAP with the SAME app
// password (EMAIL_PASS) — no new service, no new secrets.
//
// MATCHING (real metadata only, never guessed):
//   1) thread match — reply's In-Reply-To / References contains the
//      Message-ID we stored (outreach_events.resend_id) at send time
//   2) fallback — threaded reply (Re: header present) whose From address
//      equals a recipient we previously emailed (status sent/replied)
//
// IDEMPOTENT: outreach_replies_seen(message_id) records what we processed;
// duplicate events/retries are ignored. Follow-ups are stopped in the same
// transaction (queued events → cancelled, pending queue rows → skipped).
// ============================================================================
import { ImapFlow } from "imapflow";
import { pool } from "@/db";
import { markReplied } from "./pipeline";
import {
  normalizeMessageId, extractReplyMessageIds, extractFromEmail,
  extractTextPreview, isThreadedReply, REPLY_WINDOW_DAYS,
} from "./reply-parse";

export interface ReplyPollResult {
  polled: number;      // inbox messages scanned
  matched: number;     // replies matched to a lead
  applied: number;     // applied (first) — duplicates counted separately
  duplicate: number;   // already-processed replies
  errors: number;
  reason?: string;     // set when polling was skipped (no creds etc.)
}

function imapCreds(): { user: string; pass: string; host: string; port: number } | null {
  const user = (process.env.GMAIL_IMAP_USER || process.env.EMAIL_USER || "").trim();
  const pass = (process.env.GMAIL_IMAP_PASS || process.env.EMAIL_PASS || "").trim();
  if (!user || !pass) return null;
  return { user, pass, host: (process.env.GMAIL_IMAP_HOST || "imap.gmail.com").trim(), port: Number(process.env.GMAIL_IMAP_PORT || 993) };
}

const short = (s: unknown, n = 40) => String(s ?? "").slice(0, n).replace(/\s+/g, " ");

/** RFC822 header block → object (lowercased keys, unfolded continuations). */
function parseHeadersFromSource(source: string): Record<string, string> {
  const head = source.split(/\r?\n\r?\n/, 1)[0] || "";
  const out: Record<string, string> = {};
  let lastKey: string | null = null;
  for (const line of head.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && lastKey) { out[lastKey] += " " + line.trim(); continue; }
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    lastKey = line.slice(0, idx).trim().toLowerCase();
    out[lastKey] = line.slice(idx + 1).trim();
  }
  return out;
}

async function withImap<T>(fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const creds = imapCreds();
  if (!creds) throw new Error("no IMAP credentials (set EMAIL_USER/EMAIL_PASS or GMAIL_IMAP_USER/GMAIL_IMAP_PASS)");
  const client = new ImapFlow({
    host: creds.host, port: creds.port, secure: true,
    auth: { user: creds.user, pass: creds.pass },
    logger: false,
    socketTimeout: 60_000,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
  } as any);
  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Poll the Gmail INBOX for replies to our outreach emails.
 * Scans the last `windowDays` (default 3) so nothing is missed between runs,
 * and relies on outreach_replies_seen for idempotency (never touches \Seen).
 */
export async function pollGmailReplies(opts: { windowDays?: number } = {}): Promise<ReplyPollResult> {
  const result: ReplyPollResult = { polled: 0, matched: 0, applied: 0, duplicate: 0, errors: 0 };
  if (!imapCreds()) {
    result.reason = "no credentials — skipped (EMAIL_PASS not set)";
    console.log(`[REPLY] poll skipped: ${result.reason}`);
    return result;
  }
  const since = new Date(Date.now() - (opts.windowDays || REPLY_WINDOW_DAYS) * 86400000);
  try {
    await withImap(async (client) => {
      await client.mailboxOpen("INBOX", { readOnly: true });
      const uids: number[] = ((await client.search({ since }, { uid: true })) || []) as number[];
      if (!uids.length) return;
      // fetch in batches of 50 uids
      for (let i = 0; i < uids.length; i += 50) {
        const batch = uids.slice(i, i + 50);
        const range = `${batch[0]}:${batch[batch.length - 1]}`;
        for await (const msg of client.fetch(range, { source: true, envelope: true, uid: true }, { uid: true })) {
          result.polled++;
          try {
            const source = typeof msg.source === "string" ? msg.source : msg.source?.toString() || "";
            const headers = parseHeadersFromSource(source);
            const fromEmail = extractFromEmail(msg.envelope?.from?.[0]?.address || headers.from);
            const subject = headers.subject || msg.envelope?.subject || "";
            const messageId = normalizeMessageId(headers["message-id"]);
            if (!messageId) continue;
            const threadIds = extractReplyMessageIds(headers);

            // ---- locate the lead ----
            let leadId: number | null = null;
            if (threadIds.length) {
              const r = await pool.query(
                `SELECT DISTINCT e.lead_id FROM outreach_events e
                 WHERE e.resend_id = ANY($1::text[])
                   AND e.status IN ('sent','replied','sending')
                 ORDER BY e.lead_id DESC LIMIT 1`,
                [threadIds]
              );
              if ((r.rowCount ?? 0) > 0) leadId = Number(r.rows[0].lead_id);
            }
            if (leadId == null && fromEmail && isThreadedReply(headers)) {
              // threaded reply from someone we emailed — match by recipient
              const r2 = await pool.query(
                `SELECT DISTINCT e.lead_id FROM outreach_events e
                 WHERE lower(e.recipient_email) = $1
                   AND e.status IN ('sent','replied','sending')
                 ORDER BY e.lead_id DESC LIMIT 1`,
                [fromEmail]
              );
              if ((r2.rowCount ?? 0) > 0) leadId = Number(r2.rows[0].lead_id);
            }
            if (leadId == null) continue; // unmatched → retried on later polls

            result.matched++;
            console.log(`[REPLY] REPLY_RECEIVED lead=${leadId} msg=${short(messageId)} from=${short(fromEmail)} subject=${short(subject)}`);
            const applied = await markReplied(leadId, {
              messageId, subject, preview: extractTextPreview(source),
            });
            if (applied === "applied") result.applied++;
            else if (applied === "duplicate") { result.duplicate++; console.log(`[REPLY] DUPLICATE_EVENT_IGNORED lead=${leadId} msg=${short(messageId)}`); }
          } catch (e: any) {
            result.errors++;
            console.error(`[REPLY] poll: message ${msg.uid} failed:`, short(e?.message, 160));
          }
        }
      }
    });
    console.log(`[REPLY] poll done: scanned=${result.polled} matched=${result.matched} applied=${result.applied} duplicate=${result.duplicate} errors=${result.errors}`);
  } catch (e: any) {
    result.errors++;
    result.reason = short(e?.message, 200);
    console.error(`[REPLY] poll failed: ${result.reason}`);
  }
  return result;
}

/**
 * Backfill provider Message-IDs for emails that were sent BEFORE the poller
 * existed (resend_id IS NULL). Scans Gmail [Gmail]/Sent and matches by
 * recipient + ~36h time window. This makes replies to already-sent outreach
 * (e.g. the current live queue) detectable by the thread matcher.
 */
export async function backfillSentMessageIds(): Promise<{ backfilled: number; reason?: string }> {
  if (!imapCreds()) return { backfilled: 0, reason: "no credentials" };
  const need = await pool.query(
    `SELECT id, recipient_email, sent_at FROM outreach_events
     WHERE status = 'sent' AND test_send = false AND resend_id IS NULL
       AND sent_at > now() - interval '14 days'
     ORDER BY sent_at ASC LIMIT 300`
  );
  if ((need.rowCount ?? 0) === 0) return { backfilled: 0 };
  const rows = need.rows as { id: number; recipient_email: string; sent_at: string }[];
  const since = new Date(Math.min(...rows.map((r) => new Date(r.sent_at).getTime())) - 36 * 3600000);
  let backfilled = 0;
  try {
    await withImap(async (client) => {
      await client.mailboxOpen("[Gmail]/Sent", { readOnly: true });
      const uids: number[] = ((await client.search({ since: new Date(since.toISOString().slice(0, 10)), from: undefined } as any, { uid: true })) || []) as number[];
      if (!uids.length) return;
      for (let i = 0; i < uids.length; i += 50) {
        const batch = uids.slice(i, i + 50);
        for await (const msg of client.fetch(`${batch[0]}:${batch[batch.length - 1]}`, { source: true, envelope: true }, { uid: true })) {
          try {
            const source = typeof msg.source === "string" ? msg.source : msg.source?.toString() || "";
            const headers = parseHeadersFromSource(source);
            const to = ((headers.to || "") + " " + (msg.envelope?.to || []).map((t: any) => t.address).join(", ")).toLowerCase();
            const messageId = normalizeMessageId(headers["message-id"]);
            const date = new Date(msg.envelope?.date || headers.date || Date.now());
            if (!messageId) continue;
            for (const r of rows) {
              if (Math.abs(date.getTime() - new Date(r.sent_at).getTime()) > 36 * 3600000) continue;
              if (!to.includes(String(r.recipient_email).toLowerCase())) continue;
              const up = await pool.query(
                `UPDATE outreach_events SET resend_id = $2 WHERE id = $1 AND resend_id IS NULL`,
                [r.id, messageId]
              );
              if ((up.rowCount ?? 0) > 0) backfilled++;
              break;
            }
          } catch { /* skip bad message */ }
        }
      }
    });
    console.log(`[REPLY] backfill done: ${backfilled} Message-IDs recovered (of ${rows.length} candidates)`);
  } catch (e: any) {
    console.error(`[REPLY] backfill failed:`, short(e?.message, 200));
  }
  return { backfilled };
}
