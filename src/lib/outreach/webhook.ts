// ============================================================================
// RESEND WEBHOOK — delivery feedback for outreach emails.
//  • email.delivered  → delivered_at stored
//  • email.bounced    → event failed (no follow-ups will ever fire for it)
//  • email.complained → lead marked do_not_contact + event cancelled (spam
//                       complaints are an opt-out signal — never email again)
// Verification: Svix v1 scheme (HMAC-SHA256 of `${timestamp}.${body}` with the
// base64-decoded signing secret) — pure node:crypto, no extra dependency.
// Requires env RESEND_WEBHOOK_SECRET (the signing secret from the Resend
// dashboard webhook config). When unset the endpoint is disabled (fails closed).
// ============================================================================
import crypto from "node:crypto";
import { pool } from "@/db";
import { doNotContact, markReplied } from "./pipeline";

export function verifySvixSignature(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signatures: string | null },
  rawBody: string
): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signatures) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false; // 5-min tolerance
  const key = Buffer.from(secret, "base64");
  const expected = crypto.createHmac("sha256", key).update(`${headers.timestamp}.${rawBody}`).digest("hex");
  return headers.signatures.split(" ").some((chunk) => {
    const [v, sig] = chunk.split(",");
    if (v !== "v1" || !sig) return false;
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

/** Apply a Resend email event to the matching outreach event (by resend_id). */
export async function handleResendEvent(payload: any): Promise<string> {
  const type = String(payload?.type || "");
  const data = payload?.data || {};
  const resendId = data?.id || data?.message_id;
  if (!resendId) return "no-id";

  const ev = await pool.query(
    `SELECT id, lead_id, follow_up_number, status FROM outreach_events WHERE resend_id = $1 ORDER BY id DESC LIMIT 1`,
    [resendId]
  );
  if ((ev.rowCount ?? 0) === 0) return "unknown";

  switch (type) {
    case "email.delivered": {
      await pool.query(`UPDATE outreach_events SET delivered_at = now() WHERE id = $1`, [ev.rows[0].id]);
      return "delivered";
    }
    case "email.bounced": {
      await pool.query(
        `UPDATE outreach_events SET status = 'failed', error_message = 'bounced (provider)', failed_at = now() WHERE id = $1 AND status = 'sent'`,
        [ev.rows[0].id]
      );
      // follow-ups only fire from 'sent' events → a bounce stops the sequence
      return "bounced";
    }
    case "email.complained": {
      await doNotContact(Number(ev.rows[0].lead_id)); // also cancels queued events + skips queue rows
      await pool.query(
        `UPDATE outreach_events SET status = 'cancelled', error_message = 'spam complaint' WHERE id = $1 AND status IN ('sent','queued')`,
        [ev.rows[0].id]
      );
      return "complained";
    }
    // Resend reply events (available when the domain has inbound/reply
    // tracking enabled). Idempotent via markReplied's seen-record.
    case "email.replied": {
      const res = await markReplied(Number(ev.rows[0].lead_id), {
        messageId: resendId,
        subject: data?.subject || payload?.data?.email?.subject,
        preview: data?.preview || data?.snippet || data?.text || null,
      });
      return res === "applied" ? "replied" : res === "duplicate" ? "duplicate-ignored" : "replied-no-change";
    }
    default:
      return "ignored";
  }
}
