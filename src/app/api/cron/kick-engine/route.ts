import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

const ENGINE_REPO = "Akshay-Works/Vyravo-Lead-Engine";
const ENGINE_WORKFLOW_ID = 345978148; // daily-leads.yml

// GET /api/cron/kick-engine — Vercel Cron trigger (Authorization: Bearer $CRON_SECRET).
// Dispatches the lead engine's "Daily lead generation" workflow on GitHub.
// This replaces GitHub's own flaky schedule: Vercel crons fire reliably.
export async function GET(request: NextRequest) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return Response.json({ error: "CRON_SECRET not set" }, { status: 503 });
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ghToken = (process.env.GITHUB_ACTIONS_TOKEN || "").trim();
  if (!ghToken) {
    return Response.json({ error: "GITHUB_ACTIONS_TOKEN not set on this project (v2-deploy)" }, { status: 503 });
  }

  try {
    const r = await fetch(
      `https://api.github.com/repos/${ENGINE_REPO}/actions/workflows/${ENGINE_WORKFLOW_ID}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref: "main" }),
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return Response.json({ error: `GitHub dispatch failed (${r.status})`, detail: text.slice(0, 200) }, { status: 502 });
    }

    // Funnel 2 (LinkedIn + email/web discovery) — dispatched on the same Vercel
    // cron since GitHub schedules are flaky. Uses the workflow file name.
    let funnel2: any = { skipped: true, reason: "no GITHUB_ACTIONS_TOKEN variant" };
    try {
      const r2 = await fetch(
        `https://api.github.com/repos/${ENGINE_REPO}/actions/workflows/funnel2-daily.yml/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ghToken}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ref: "main" }),
          signal: AbortSignal.timeout(15000),
        }
      );
      funnel2 = r2.ok ? { dispatched: "funnel2-daily.yml" } : { error: `funnel2 dispatch failed (${r2.status})` };
    } catch (e2: any) {
      funnel2 = { error: e2.message };
    }
    console.log("kick-engine funnel2:", JSON.stringify(funnel2));
    return Response.json({ ok: true, dispatched: ENGINE_WORKFLOW_ID, funnel2, at: new Date().toISOString() });
  } catch (e: any) {
    console.error("kick-engine error:", e.message);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}
