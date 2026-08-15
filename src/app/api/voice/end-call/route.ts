// POST /api/voice/end-call
// Finalizes the call: generates the summary, runs the integration side
// effects (existing CRM + Email Automation), persists the call record, and
// releases the line. If CRM fails, the call is still stored and marked
// "CRM sync failed — retry required".

import { finalizeCall, stateToRecord } from "@/lib/voice/engine";
import { getSession, deleteSession } from "@/lib/voice/sessions";
import { getVoiceProvider } from "@/lib/voice/provider";
import {
  syncVoiceLeadToCrm,
  triggerEmailAutomation,
  classifyCrmSyncStatus,
  classifyEmailStatus,
  type EmailTriggerType,
} from "@/lib/voice/integrations";
import { withStore } from "@/lib/voice/storage";
import { isAuthorized, unauthorizedResponse } from "@/lib/voice/auth";
import type { CallRecord, EmailStatus } from "@/lib/voice/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorizedResponse();

  let body: { callId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const callId = typeof body.callId === "string" ? body.callId.trim() : "";
  if (!callId) return Response.json({ error: "callId is required." }, { status: 400 });

  const state = getSession(callId);
  if (!state) {
    return Response.json({ error: "Call not found. It may already have ended." }, { status: 404 });
  }
  deleteSession(callId);

  const durationSec = Math.max(1, Math.round((Date.now() - state.startedAt) / 1000));
  const summary = finalizeCall(state, durationSec);

  // ---------------------------------------------------------------------
  // CRM (existing HubSpot integration) — deduped create/update by email.
  // ---------------------------------------------------------------------
  const needsCrm = state.leadStatus === "qualified" || state.leadStatus === "customer";
  let crmSyncStatus: CallRecord["crmSyncStatus"] = "not_required";
  let crmDetail: string | null = null;
  if (needsCrm && state.qualification.email) {
    const result = await syncVoiceLeadToCrm({
      callerName: state.qualification.name ?? null,
      callerEmail: state.qualification.email ?? null,
      callerPhone: state.qualification.phone ?? state.callerPhone ?? null,
      callerCompany: state.qualification.company ?? null,
      summary: summary.summary,
      qualification: state.qualification,
    });
    crmSyncStatus = classifyCrmSyncStatus(result);
    if (result.ok) {
      state.actions.push(
        result.action === "updated"
          ? "CRM lead updated (HubSpot, existing contact)"
          : "CRM lead created (HubSpot)"
      );
      crmDetail = result.action || "synced";
    } else {
      state.actions.push("CRM sync failed — retry required");
      crmDetail = result.error || "CRM sync failed";
    }
  } else if (needsCrm) {
    state.actions.push("CRM sync not required — no caller email captured");
  }

  // ---------------------------------------------------------------------
  // Email Automation (existing app via optional webhook)
  // ---------------------------------------------------------------------
  let emailStatus: EmailStatus = "not_required";
  const emailPayload = {
    callId,
    callerName: state.qualification.name || state.callerName,
    callerEmail: state.qualification.email,
    callerPhone: state.qualification.phone || state.callerPhone,
    callerCompany: state.qualification.company,
    intent: summary.intent,
    outcome: summary.outcome,
    summary: summary.summary,
    serviceInterest: state.qualification.serviceInterest,
    preferredContactTime: state.qualification.preferredContactTime,
  };
  let emailType: EmailTriggerType | null = null;
  if (state.bookingConfirmed) emailType = "appointment_booked";
  else if (state.actions.includes("Human escalation requested")) emailType = "human_escalation";
  else if (state.actions.includes("Complaint logged — human follow-up required")) emailType = "human_escalation";
  else if (state.callbackOffered) emailType = "callback_request";
  else if (state.leadStatus === "qualified") emailType = "new_qualified_lead";

  if (emailType && state.qualification.email) {
    const result = await triggerEmailAutomation(emailType, emailPayload);
    emailStatus = classifyEmailStatus(result);
    if (result.ok) state.actions.push(`Follow-up email triggered (${emailType})`);
    else if (result.simulated) state.actions.push("Follow-up email queued (simulated — Email Automation not connected)");
    else state.actions.push("Follow-up email trigger failed");
  }

  // ---------------------------------------------------------------------
  // Persist the call — even if CRM/email failed, the call is stored.
  // ---------------------------------------------------------------------
  summary.actions = [...state.actions]; // include integration side effects
  const record = stateToRecord(state, summary, durationSec, "demo", crmSyncStatus, emailStatus);
  await withStore((s) => s.saveCall(record));

  // Release the (simulated) line.
  await getVoiceProvider().endCall(callId).catch(() => undefined);

  return Response.json({
    success: true,
    call: record,
    integrations: {
      crm: { status: crmSyncStatus, detail: crmDetail },
      email: { status: emailStatus, type: emailType },
    },
    persisted: true,
  });
}
