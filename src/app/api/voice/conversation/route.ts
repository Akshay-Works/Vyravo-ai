// POST /api/voice/conversation
// One conversation turn: caller message in → receptionist reply out.
// The engine detects intent, captures lead information, and marks actions.
// (CRM/email side effects happen at call end — see end-call.)

import { processTurn } from "@/lib/voice/engine";
import { getSession, setSession } from "@/lib/voice/sessions";
import { isAuthorized, unauthorizedResponse } from "@/lib/voice/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorizedResponse();

  let body: { callId?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const callId = typeof body.callId === "string" ? body.callId.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";

  if (!callId) return Response.json({ error: "callId is required." }, { status: 400 });
  if (!message) return Response.json({ error: "message is required." }, { status: 400 });

  const state = getSession(callId);
  if (!state) {
    return Response.json(
      { error: "Call not found. It may have ended or expired — start a new demo call." },
      { status: 404 }
    );
  }

  const turn = processTurn(state, message);
  setSession(state);

  return Response.json({
    callId,
    reply: turn.reply,
    intent: turn.intent,
    leadStatus: turn.leadStatus,
    leadQualified: turn.leadQualified,
    callEnded: turn.callEnded,
    bookingRequested: turn.bookingRequested,
    actions: turn.actions,
    qualification: state.qualification,
    transcript: state.transcript,
  });
}
