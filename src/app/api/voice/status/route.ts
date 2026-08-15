// GET /api/voice/status
// Reports the honest integration status of the Voice Receptionist:
// which provider is active, whether CRM/email integrations are connected,
// where data is persisted, and whether admin protection is enabled.
// Never returns secret values — only booleans and labels.

import { getProviderStatus } from "@/lib/voice/provider";
import { isEmailAutomationConfigured } from "@/lib/voice/integrations";
import { isHubSpotConfigured } from "@/lib/integrations/hubspot";
import { getVoiceStore } from "@/lib/voice/storage";
import { adminKeyConfigured, isAuthorized, unauthorizedResponse } from "@/lib/voice/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorizedResponse();

  const store = getVoiceStore();
  return Response.json({
    provider: getProviderStatus(),
    integrations: {
      crm: {
        name: "HubSpot CRM",
        connected: isHubSpotConfigured(),
        note: isHubSpotConfigured()
          ? "Connected — voice leads sync to HubSpot (create or update by email)."
          : "Not configured (HUBSPOT_ACCESS_TOKEN). Leads are captured locally only.",
      },
      emailAutomation: {
        name: "Email Automation",
        connected: isEmailAutomationConfigured(),
        note: isEmailAutomationConfigured()
          ? "Connected — triggers forwarded to the Email Automation app."
          : "Not configured (EMAIL_AUTOMATION_WEBHOOK_URL). Email triggers are queued (simulated).",
      },
      discoveryCall: {
        name: "Discovery Call Automation",
        connected: true,
        note: "Callers are sent through the existing booking flow.",
      },
    },
    persistence: {
      mode: store.mode,
      note:
        store.mode === "database"
          ? "Calls are persisted in the project database."
          : "In-memory (demo) — calls are lost on redeploy.",
    },
    security: {
      adminKeyConfigured: adminKeyConfigured(),
      note: adminKeyConfigured()
        ? "Admin key required for all voice API endpoints."
        : "Demo mode — no admin key configured, endpoints are open.",
    },
    demoMode: true,
  });
}
