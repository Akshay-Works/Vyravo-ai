// GET  /api/voice/config — current receptionist configuration (no secrets).
// POST /api/voice/config — save configuration (admin key required when set).

import { withStore } from "@/lib/voice/storage";
import { getDefaultConfig } from "@/lib/voice/knowledge";
import { isAuthorized, unauthorizedResponse } from "@/lib/voice/auth";
import type { VoiceConfig } from "@/lib/voice/types";

export const dynamic = "force-dynamic";

const MAX_LEN = 2000;

function sanitizeConfig(input: Partial<VoiceConfig>): VoiceConfig {
  const defaults = getDefaultConfig();
  const str = (v: unknown, fallback: string): string =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, MAX_LEN) : fallback;

  return {
    businessId: "vyravo-demo",
    businessName: str(input.businessName, defaults.businessName),
    businessDescription: str(input.businessDescription, defaults.businessDescription),
    industry: str(input.industry, defaults.industry),
    location: str(input.location, defaults.location),
    businessHours: str(input.businessHours, defaults.businessHours),
    timeZone: str(input.timeZone, defaults.timeZone),
    receptionistName: str(input.receptionistName, defaults.receptionistName),
    voice: str(input.voice, defaults.voice),
    language: str(input.language, defaults.language),
    speakingStyle: str(input.speakingStyle, defaults.speakingStyle),
    greeting: str(input.greeting, defaults.greeting),
    escalationEnabled:
      typeof input.escalationEnabled === "boolean" ? input.escalationEnabled : defaults.escalationEnabled,
    transferNumber:
      typeof input.transferNumber === "string" && input.transferNumber.trim()
        ? input.transferNumber.trim().slice(0, 40)
        : null,
    demoMode: true, // demo is the only mode until a real provider connects
  };
}

export async function GET() {
  const config = await withStore((s) => s.getConfig());
  return Response.json({ config });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorizedResponse();

  try {
    const body = await request.json();
    const config = sanitizeConfig(body?.config || body || {});
    await withStore((s) => s.saveConfig(config));
    return Response.json({ success: true, config });
  } catch {
    return Response.json({ error: "Invalid configuration payload." }, { status: 400 });
  }
}
