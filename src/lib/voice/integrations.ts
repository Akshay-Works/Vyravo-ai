// Voice Receptionist — integration layer.
//
// Reuses the EXISTING integrations in the project — no second CRM, no
// duplicate booking or email systems:
//
//   CRM            → lib/integrations/hubspot.ts (syncLeadToHubSpot, already
//                    dedupes contacts by email: create or update).
//   Discovery call → the existing Discovery Call Automation app
//                    (SITE_LINKS.discoveryCall). Callers are sent through the
//                    existing booking flow; we record the request and confirm.
//   Email          → the existing Email Automation app, triggered through an
//                    optional webhook URL (EMAIL_AUTOMATION_WEBHOOK_URL). If it
//                    is not configured, triggers are recorded honestly as
//                    "queued (simulated)" — never presented as sent.
//
// All secrets stay server-side; nothing here is exposed to the browser.

import { isHubSpotConfigured, syncLeadToHubSpot } from "@/lib/integrations/hubspot";
import type { CallRecord, EmailStatus } from "./types";

// ---------------------------------------------------------------------------
// CRM (existing HubSpot integration)
// ---------------------------------------------------------------------------

export interface VoiceCrmResult {
  configured: boolean;
  ok: boolean;
  action?: "created" | "updated";
  error?: string;
}

/**
 * Sync a qualified voice lead into the existing CRM.
 * Existing syncLeadToHubSpot already dedupes by email (create or update).
 */
export async function syncVoiceLeadToCrm(
  record: Pick<
    CallRecord,
    "callerName" | "callerEmail" | "callerPhone" | "callerCompany" | "summary" | "qualification"
  >
): Promise<VoiceCrmResult> {
  if (!isHubSpotConfigured()) {
    return { configured: false, ok: false, error: "HUBSPOT_ACCESS_TOKEN not configured" };
  }
  const email = record.callerEmail;
  if (!email) {
    return {
      configured: true,
      ok: false,
      error: "Caller did not provide an email — CRM sync requires one.",
    };
  }
  try {
    const result = await syncLeadToHubSpot(
      {
        fullName: record.callerName || "Voice Caller",
        email,
        phone: record.callerPhone || null,
        businessName: record.callerCompany || null,
        source: "voice-receptionist",
        qualificationSummary: record.summary,
        biggestChallenge: record.qualification?.serviceInterest
          ? `Interested in: ${record.qualification.serviceInterest}`
          : null,
        automationGoals: record.qualification?.requirements || null,
        budgetRange: record.qualification?.budgetRange || null,
      },
      { dealStageLabel: "Prospecting" }
    );
    return {
      configured: true,
      ok: result.ok,
      action: result.action,
      error: result.error,
    };
  } catch (e) {
    return { configured: true, ok: false, error: String((e as Error)?.message || e).slice(0, 300) };
  }
}

// ---------------------------------------------------------------------------
// Email Automation (existing app, triggered via optional webhook)
// ---------------------------------------------------------------------------

export type EmailTriggerType =
  | "new_qualified_lead"
  | "callback_request"
  | "appointment_booked"
  | "information_request"
  | "human_escalation";

export interface EmailTriggerResult {
  configured: boolean;
  ok: boolean;
  simulated: boolean;
  error?: string;
}

export function isEmailAutomationConfigured(): boolean {
  return Boolean(process.env.EMAIL_AUTOMATION_WEBHOOK_URL?.trim());
}

/**
 * Trigger the existing Email Automation app.
 * If EMAIL_AUTOMATION_WEBHOOK_URL is set, the trigger is forwarded there.
 * Otherwise the trigger is recorded as queued/simulated — the UI labels it
 * honestly rather than pretending an email was sent.
 */
export async function triggerEmailAutomation(
  type: EmailTriggerType,
  payload: Record<string, unknown>
): Promise<EmailTriggerResult> {
  const url = process.env.EMAIL_AUTOMATION_WEBHOOK_URL?.trim();
  if (!url) {
    return { configured: false, ok: false, simulated: true, error: "EMAIL_AUTOMATION_WEBHOOK_URL not configured" };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload, source: "voice-receptionist" }),
    });
    if (!res.ok) {
      return { configured: true, ok: false, simulated: false, error: `Webhook responded ${res.status}` };
    }
    return { configured: true, ok: true, simulated: false };
  } catch (e) {
    return { configured: true, ok: false, simulated: false, error: String((e as Error)?.message || e).slice(0, 300) };
  }
}

// ---------------------------------------------------------------------------
// Outcome → action helpers (shared by the API layer)
// ---------------------------------------------------------------------------

export function classifyCrmSyncStatus(result: VoiceCrmResult): CallRecord["crmSyncStatus"] {
  if (!result.configured) return "not_required";
  return result.ok ? "synced" : "failed";
}

export function classifyEmailStatus(result: EmailTriggerResult): EmailStatus {
  if (!result.configured || result.simulated) return "not_required";
  return result.ok ? "triggered" : "failed";
}
