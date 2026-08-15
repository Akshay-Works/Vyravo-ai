// POST /api/voice/demo-call
// Starts a simulated incoming call through the active voice provider.
// Demo Mode only — a real provider flow is reserved until one is connected.

import { getVoiceProvider } from "@/lib/voice/provider";
import { getBusinessKnowledge, renderGreeting } from "@/lib/voice/knowledge";
import { createCallState } from "@/lib/voice/engine";
import { getSession, setSession } from "@/lib/voice/sessions";
import { withStore } from "@/lib/voice/storage";
import { isAuthorized, unauthorizedResponse } from "@/lib/voice/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorizedResponse();

  const provider = getVoiceProvider();
  if (provider.mode !== "demo") {
    return Response.json(
      { error: "No live voice provider is connected yet — Demo Mode is the only available mode." },
      { status: 409 }
    );
  }

  const config = await withStore((s) => s.getConfig());
  const knowledge = getBusinessKnowledge(config);

  const incoming = await provider.startIncomingCall();
  const state = createCallState(incoming.callId, config, incoming.from);
  const greeting = renderGreeting(config);

  state.transcript.push({
    role: "system",
    text: `Incoming call from ${incoming.from} — answered by AI receptionist (${config.receptionistName}).`,
    at: new Date().toISOString(),
  });
  state.transcript.push({ role: "receptionist", text: greeting, at: new Date().toISOString() });

  setSession(state);

  return Response.json({
    callId: state.callId,
    from: incoming.from,
    to: incoming.to,
    mode: provider.mode,
    receptionistName: config.receptionistName,
    businessName: knowledge.businessName,
    transcript: state.transcript,
    note: "Demo Mode — this is a simulated call. No live phone line is connected.",
  });
}
