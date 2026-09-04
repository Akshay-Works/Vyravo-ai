// ============================================================================
// LINKEDIN SENDER ABSTRACTION — the one place that knows *how* a message is
// delivered on LinkedIn. Nothing is ever sent by default.
//
// CONFIGURATION (all server-side env vars, never in the browser):
//   LINKEDIN_SEND_WEBHOOK_URL   — optional gateway that performs the send
//                                 (any system the operator trusts: n8n/Zapier/
//                                 Make, a personal automation, a VA tool…).
//   LINKEDIN_SEND_WEBHOOK_TOKEN — optional bearer token for that gateway.
//
// When neither is set the sender is "manual": messages reach Approved/Queued
// and the Admin shows the exact profile + message for the operator to send,
// with a "Mark as Sent" action. The system NEVER claims an automatic send
// that did not happen, NEVER hardcodes an account, and NEVER invents a
// recipient — the recipient is always the CRM lead's own LinkedIn URL.
// ============================================================================

export interface SendTarget {
  profileUrl: string;   // ALWAYS the lead's own LinkedIn profile (from CRM)
  message: string;
  leadId: number;
}

export interface SendResult {
  ok: boolean;
  mode: "manual" | "webhook" | "simulated";
  id?: string;          // provider message id when the gateway returns one
  error?: string;
}

export type SenderMode = "manual" | "webhook";

/** Which sender is active right now on this server. */
export function getSenderMode(): SenderMode {
  return process.env.LINKEDIN_SEND_WEBHOOK_URL?.trim() ? "webhook" : "manual";
}

/**
 * Send one message. Throws nothing — always returns a structured result.
 * The profile URL comes from the caller (the selected CRM lead), never from
 * config, so a message can never be sent to an operator's own account by
 * misconfiguration.
 */
export async function sendLinkedInMessage(target: SendTarget, opts: { simulate?: boolean } = {}): Promise<SendResult> {
  if (opts.simulate) {
    return { ok: true, mode: "simulated" };
  }
  const webhookUrl = process.env.LINKEDIN_SEND_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    return {
      ok: false,
      mode: "manual",
      error: "No LinkedIn sender configured — message is ready for manual send (open the profile in Admin)",
    };
  }
  const token = process.env.LINKEDIN_SEND_WEBHOOK_TOKEN?.trim();
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        leadId: target.leadId,
        profileUrl: target.profileUrl,
        message: target.message,
        source: "vyravo-linkedin-outreach",
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, mode: "webhook", error: `Gateway error (${res.status}): ${text.slice(0, 200)}` };
    }
    let id: string | undefined;
    try { const j = await res.json(); id = j?.id ?? j?.messageId ?? String(j?.ok ?? "ok"); } catch { /* ok */ }
    return { ok: true, mode: "webhook", id };
  } catch (e: any) {
    return { ok: false, mode: "webhook", error: String(e?.message || e).slice(0, 300) };
  }
}
