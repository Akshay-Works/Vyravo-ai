// Voice Receptionist — active call sessions.
//
// Holds the live conversation state for in-progress calls. Sessions are
// process-local: in Demo Mode this is a per-instance registry, which is
// fine for short simulated calls. When a real provider ships, the provider
// adapter hands calls through the same interface (see provider.ts).

import type { CallState } from "./engine";

const sessions = new Map<string, CallState>();

export function getSession(callId: string): CallState | null {
  return sessions.get(callId) || null;
}

export function setSession(state: CallState): void {
  sessions.set(state.callId, state);
}

export function deleteSession(callId: string): void {
  sessions.delete(callId);
}

export function countActiveSessions(): number {
  return sessions.size;
}
