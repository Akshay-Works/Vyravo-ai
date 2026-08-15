// GET  /api/voice/calls/[id] — call detail.
// POST /api/voice/calls/[id] — retry a failed CRM sync ({ action: "retry-crm-sync" }).

import { withStore } from "@/lib/voice/storage";
import { syncVoiceLeadToCrm, classifyCrmSyncStatus } from "@/lib/voice/integrations";
import { isAuthorized, unauthorizedResponse } from "@/lib/voice/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(request)) return unauthorizedResponse();
  const { id } = await params;

  const call = await withStore((s) => s.getCall(id));
  if (!call) {
    return Response.json({ error: "Call not found." }, { status: 404 });
  }
  return Response.json({ call });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(request)) return unauthorizedResponse();
  const { id } = await params;

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.action !== "retry-crm-sync") {
    return Response.json({ error: "Unsupported action." }, { status: 400 });
  }

  const call = await withStore((s) => s.getCall(id));
  if (!call) return Response.json({ error: "Call not found." }, { status: 404 });
  if (!call.callerEmail) {
    return Response.json(
      { error: "Cannot retry CRM sync — the call has no caller email.", call },
      { status: 400 }
    );
  }

  const result = await syncVoiceLeadToCrm({
    callerName: call.callerName,
    callerEmail: call.callerEmail,
    callerPhone: call.callerPhone,
    callerCompany: call.callerCompany,
    summary: call.summary,
    qualification: call.qualification,
  });

  const status = classifyCrmSyncStatus(result);
  const updated = await withStore((s) => s.updateCall(id, { crmSyncStatus: status }));

  return Response.json({
    success: result.ok,
    crm: { status, action: result.action, error: result.error },
    call: updated,
  });
}
