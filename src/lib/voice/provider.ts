// Voice Receptionist — provider abstraction.
//
// The application is NOT coupled to a single voice provider. The VoiceProvider
// interface below is the single place where a real telephony provider (e.g.
// Twilio, Telnyx, Vonage) plugs in. Today the only concrete implementation is
// DemoVoiceProvider — a simulated line used to demonstrate the receptionist
// before a real phone number is connected.
//
// The UI and API layers always call through this interface, so swapping in a
// live provider later touches nothing else.

import type { ProviderStatus } from "./types";

export interface IncomingCall {
  callId: string;
  from: string; // caller phone number
  to: string; // business number
  startedAt: string; // ISO
}

export interface VoiceProvider {
  id: string;
  label: string;
  mode: "demo" | "live";
  connected: boolean;
  supportsTransfer: boolean;

  /** A call arrives. Returns call metadata. */
  startIncomingCall(): Promise<IncomingCall>;

  /** Gracefully end a call. */
  endCall(callId: string): Promise<void>;

  /** Transfer the call to a human number. Returns false when unsupported. */
  transferCall(callId: string, targetNumber: string): Promise<boolean>;
}

const SIMULATED_CALLER_POOL = [
  "+91 98220 145XX",
  "+91 99301 882XX",
  "+1 415 555 01XX",
  "+44 7700 9001XX",
];

let simCounter = 0;

export class DemoVoiceProvider implements VoiceProvider {
  id = "demo";
  label = "Demo Mode (simulated line)";
  mode = "demo" as const;
  connected = true;
  supportsTransfer = false; // no real line — never pretend a transfer happened

  async startIncomingCall(): Promise<IncomingCall> {
    const idx = simCounter++ % SIMULATED_CALLER_POOL.length;
    return {
      callId: crypto.randomUUID(),
      from: SIMULATED_CALLER_POOL[idx],
      to: "Vyravo AI (simulated)",
      startedAt: new Date().toISOString(),
    };
  }

  async endCall(_callId: string): Promise<void> {
    // Simulated line — nothing to release.
  }

  async transferCall(_callId: string, _targetNumber: string): Promise<boolean> {
    // No real telephony bridge in demo mode. The engine handles escalation
    // honestly (callback request) instead of pretending a transfer happened.
    return false;
  }
}

let providerInstance: VoiceProvider | null = null;

/**
 * Return the active voice provider. Selection is env-driven so a live
 * provider can be enabled without code changes:
 *   VOICE_PROVIDER=demo            (default) simulated line
 *   VOICE_PROVIDER=live            reserved — returns the not-connected
 *                                  placeholder until a real provider ships.
 */
export function getVoiceProvider(): VoiceProvider {
  if (providerInstance) return providerInstance;

  const requested = (process.env.VOICE_PROVIDER || "demo").trim().toLowerCase();
  if (requested === "live") {
    // Architecture is ready; the concrete live adapter is a future step.
    providerInstance = {
      id: "none",
      label: "Live provider not connected",
      mode: "live",
      connected: false,
      supportsTransfer: false,
      async startIncomingCall() {
        throw new Error("No live voice provider is connected yet.");
      },
      async endCall() {},
      async transferCall() {
        return false;
      },
    };
  } else {
    providerInstance = new DemoVoiceProvider();
  }
  return providerInstance;
}

export function getProviderStatus(): ProviderStatus {
  const p = getVoiceProvider();
  return {
    id: p.id,
    mode: p.mode,
    connected: p.connected,
    supportsTransfer: p.supportsTransfer,
    label: p.label,
  };
}
