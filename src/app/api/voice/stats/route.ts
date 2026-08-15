// GET /api/voice/stats — operational analytics.
// Every number is computed from actually stored calls. Nothing fabricated.

import { withStore } from "@/lib/voice/storage";
import { isAuthorized, unauthorizedResponse } from "@/lib/voice/auth";
import type { VoiceStats } from "@/lib/voice/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorizedResponse();

  const calls = await withStore((s) => s.listCalls(500));

  const qualifiedLeads = calls.filter((c) => c.leadStatus === "qualified").length;
  const appointmentsBooked = calls.filter((c) => c.actions.some((a) => a.includes("Discovery call requested"))).length;
  const escalations = calls.filter(
    (c) =>
      c.actions.some((a) => a.includes("Human escalation")) ||
      c.actions.some((a) => a.includes("Complaint logged")) ||
      c.outcome === "Callback requested"
  ).length;
  const answeredCalls = calls.filter((c) => c.outcome !== "missed").length;
  const missedCalls = calls.length - answeredCalls;
  const totalDuration = calls.reduce((sum, c) => sum + (c.durationSec || 0), 0);

  // "Today" in the business timezone (IST).
  const istDay = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  const today = istDay(new Date());
  const todayCalls = calls.filter((c) => istDay(new Date(c.startedAt)) === today).length;

  const stats: VoiceStats = {
    totalCalls: calls.length,
    todayCalls,
    answeredCalls,
    missedCalls,
    qualifiedLeads,
    appointmentsBooked,
    escalations,
    averageDurationSec: calls.length ? Math.round(totalDuration / calls.length) : 0,
    leadConversionRate: calls.length ? qualifiedLeads / calls.length : 0,
    demoMode: true,
  };

  return Response.json({ stats });
}
