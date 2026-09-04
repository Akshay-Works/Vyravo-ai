// ============================================================================
// WHATSAPP SENDER — the ONLY place that talks to the OFFICIAL
// Meta WhatsApp Business Platform (Cloud API). No scraping, no unofficial
// APIs, no browser automation — ever.
//
// CONFIGURATION (server-side env vars only, never in the browser):
//   WHATSAPP_ACCESS_TOKEN       Meta Cloud API permanent/system-user token
//   WHATSAPP_PHONE_NUMBER_ID    WABA phone-number ID (the sender number)
//   WHATSAPP_APP_SECRET         Meta App secret (webhook HMAC verification)
//   WHATSAPP_VERIFY_TOKEN       your chosen webhook verify token
//   WHATSAPP_GRAPH_VERSION      default v23.0
//
// POLICY HONESTY:
// • Business-initiated messages REQUIRE an approved template — this module
//   only ever sends templates to non-session contacts.
// • Text messages are allowed ONLY inside an open 24h customer-service
//   session (lead replied within 24h) — sendAllowedSessionMessage().
// • If Meta rejects (131026 etc.), we report the exact provider error and the
//   pipeline marks the row Failed (never "sent") — callers decide retry.
// ============================================================================

export interface WhatsSendResult {
  ok: boolean;
  mode: "official" | "simulated" | "unconfigured";
  id?: string;        // Meta wamid on success
  error?: string;
  policyBlock?: boolean; // Meta policy/eligibility rejection (131026/131030/131049…)
}

export interface WhatsConfig {
  token: string;
  phoneNumberId: string;
  appSecret: string;
  verifyToken: string;
  graphVersion: string;
}

export function getWhatsConfig(): WhatsConfig {
  return {
    token: (process.env.WHATSAPP_ACCESS_TOKEN || "").trim(),
    phoneNumberId: (process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim(),
    appSecret: (process.env.WHATSAPP_APP_SECRET || "").trim(),
    verifyToken: (process.env.WHATSAPP_VERIFY_TOKEN || "").trim(),
    graphVersion: (process.env.WHATSAPP_GRAPH_VERSION || "v23.0").trim(),
  };
}

/** True when all credentials needed for a real send exist on this server. */
export function isWhatsConfigured(): boolean {
  const c = getWhatsConfig();
  return Boolean(c.token && c.phoneNumberId);
}

// ---------------------------------------------------------------------------
// validateRecipient — format gate only. Real WhatsApp membership is decided
// by Meta at send time (and reported back), never assumed.
// ---------------------------------------------------------------------------
export function validateRecipient(number: string): { valid: boolean; error?: string } {
  if (!/^\+[1-9]\d{1,3}\d{6,11}$/.test(number)) {
    return { valid: false, error: `invalid international number "${number}"` };
  }
  return { valid: true };
}

async function graphPost(cfg: WhatsConfig, path: string, payload: unknown): Promise<{ ok: boolean; id?: string; error?: string; policyBlock?: boolean; http?: number }> {
  const res = await fetch(`https://graph.facebook.com/${cfg.graphVersion}/${cfg.phoneNumberId}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const raw = await res.text().catch(() => "");
  if (!res.ok) {
    let msg = raw.slice(0, 300);
    let code = res.status;
    try {
      const j = JSON.parse(raw);
      code = j?.error?.code ?? res.status;
      msg = (j?.error?.fbtrace_id ? `fbtrace=${j.error.fbtrace_id} ` : "") + String(j?.error?.message || j?.error?.error_data?.details || raw).slice(0, 280);
    } catch { /* keep raw */ }
    const policy = [131026, 131030, 131049, 131056, 132001, 132012, 133010, 190, 10].includes(Number(code)) || res.status === 403;
    return { ok: false, error: `Meta API error ${code}: ${msg}`, policyBlock: policy, http: res.status };
  }
  try {
    const j = JSON.parse(raw);
    const id = j?.messages?.[0]?.id || j?.id;
    if (!id) return { ok: false, error: "Meta API returned no message id" };
    return { ok: true, id };
  } catch {
    return { ok: false, error: "Meta API returned an unparseable response" };
  }
}

/**
 * sendTemplateMessage — the ONLY legitimate way to message a lead outside an
 * open 24h session. Template must exist + be approved in the WABA.
 */
export async function sendTemplateMessage(to: string, templateProviderName: string, language: string, variables: Record<string, string>, opts: { simulate?: boolean } = {}): Promise<WhatsSendResult> {
  if (opts.simulate) return { ok: true, mode: "simulated", id: "sim_" + Date.now() };
  const cfg = getWhatsConfig();
  if (!cfg.token || !cfg.phoneNumberId) {
    return { ok: false, mode: "unconfigured", error: "Meta WhatsApp API not configured (set WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID)" };
  }
  const v = validateRecipient(to);
  if (!v.valid) return { ok: false, mode: "official", error: v.error };
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateProviderName,
      language: { code: language },
      components: variables["{body}"] !== undefined
        ? [{ type: "body", parameters: [{ type: "text", text: variables["{body}"] }] }]
        : undefined,
    },
  };
  const r = await graphPost(cfg, "messages", body);
  return { ok: r.ok, mode: "official", id: r.id, error: r.error, policyBlock: r.policyBlock };
}

/**
 * sendAllowedSessionMessage — free-form text ONLY inside an open 24h
 * customer-service session (lead messaged you first within 24h).
 */
export async function sendAllowedSessionMessage(to: string, text: string, opts: { simulate?: boolean } = {}): Promise<WhatsSendResult> {
  if (opts.simulate) return { ok: true, mode: "simulated", id: "sim_" + Date.now() };
  const cfg = getWhatsConfig();
  if (!cfg.token || !cfg.phoneNumberId) {
    return { ok: false, mode: "unconfigured", error: "Meta WhatsApp API not configured" };
  }
  const v = validateRecipient(to);
  if (!v.valid) return { ok: false, mode: "official", error: v.error };
  const r = await graphPost(cfg, "messages", {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  });
  return { ok: r.ok, mode: "official", id: r.id, error: r.error, policyBlock: r.policyBlock };
}

/** getMessageStatus — optional; statuses normally arrive via webhook. */
export async function getMessageStatus(messageId: string): Promise<{ ok: boolean; status?: string; error?: string }> {
  const cfg = getWhatsConfig();
  if (!cfg.token) return { ok: false, error: "Meta WhatsApp API not configured" };
  try {
    const res = await fetch(`https://graph.facebook.com/${cfg.graphVersion}/${messageId}?fields=id,status`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: AbortSignal.timeout(12000),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: String(j?.error?.message || res.status).slice(0, 200) };
    return { ok: true, status: j?.status };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e).slice(0, 200) };
  }
}

// ---------------------------------------------------------------------------
// OPT-OUT keyword detection (§14)
// ---------------------------------------------------------------------------
const OPT_OUT_RE = /\b(stop|unsubscribe|don'?t (message|contact|text|mail)|do not (message|contact|text|mail)|no thanks|not interested|remove me|take me off|don'?t contact (me|us)|do not contact (me|us)|quit)\b/i;
const OPT_OUT_HI_RE = /\b(बंद|रोकें|मत भेजें|संपर्क न करें|नहीं चाहिए)\b/;

export function isOptOutMessage(text: string): boolean {
  if (!text) return false;
  const t = text.trim().slice(0, 300);
  return OPT_OUT_RE.test(t) || OPT_OUT_HI_RE.test(t);
}

export function handleOptOut(text: string): "opt_out" | "none" {
  return isOptOutMessage(text) ? "opt_out" : "none";
}
