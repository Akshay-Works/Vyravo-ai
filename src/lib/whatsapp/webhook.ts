// ============================================================================
// WHATSAPP WEBHOOK — Meta Cloud API signature verification + event parsing.
// Meta signs the raw body with SHA-256 HMAC using the App Secret:
//   X-Hub-Signature-256: sha256=<hex(hmac_sha256(app_secret, raw_body))>
// We fail closed: unverified payloads are rejected; no secret → 503.
// ============================================================================
import crypto from "node:crypto";
import { applyStatusUpdate, applyIncomingMessage } from "./pipeline";
import { getWhatsConfig, isOptOutMessage } from "./sender";

export function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | null): boolean {
  const config = getWhatsConfig();
  if (!config.appSecret) return false;
  if (!signatureHeader) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", config.appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(String(signatureHeader).trim());
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function verifyToken(challengeToken: string | null): boolean {
  const config = getWhatsConfig();
  if (!config.verifyToken) return false;
  return challengeToken === config.verifyToken;
}

export interface WebhookResult {
  handled: number;
  statuses: string[];
  incoming: { leadId?: number; optedOut?: boolean; body?: string }[];
}

/** Parse a Meta webhook payload and apply every event. */
export async function processWhatsAppWebhook(payload: any): Promise<WebhookResult> {
  const res: WebhookResult = { handled: 0, statuses: [], incoming: [] };
  const entries = payload?.entry || [];
  for (const entry of entries) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      // message status updates (sent / delivered / read / failed)
      for (const st of value?.statuses || []) {
        if (!st?.id) continue;
        const out = await applyStatusUpdate(String(st.id), String(st.status || "sent"), st.timestamp ? String(st.timestamp) : undefined);
        res.statuses.push(`${st.status}@${String(st.id).slice(0, 20)}→${out}`);
        res.handled++;
      }
      // incoming messages (replies / opt-outs)
      for (const msg of value?.messages || []) {
        if (!msg?.from) continue;
        let body = "";
        if (msg?.text?.body) body = String(msg.text.body);
        else if (msg?.button?.text) body = String(msg.button.text);
        else if (msg?.interactive?.button_reply?.title) body = String(msg.interactive.button_reply.title);
        else if (Array.isArray(msg?.image)) body = "(image)";
        const r = await applyIncomingMessage(String(msg.from), body.slice(0, 2000), msg?.id ? String(msg.id) : undefined, msg?.timestamp ? String(msg.timestamp) : undefined);
        res.incoming.push({ leadId: r.leadId, optedOut: r.optedOut, body: body.slice(0, 120) });
        res.handled++;
      }
    }
  }
  return res;
}
