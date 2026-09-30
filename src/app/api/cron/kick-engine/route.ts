import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { recordHeartbeat } from "@/lib/activity/heartbeat";

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
      await recordHeartbeat("cron_kick_engine", "error", { githubStatus: r.status });
      return Response.json({ error: `GitHub dispatch failed (${r.status})`, detail: text.slice(0, 200) }, { status: 502 });
    }

    // Funnel 2 + Foreign run on CIRCLECI via the watchdog below — NOT dispatched
    // here. (Sep 2026: GitHub's 2,000 free minutes died on the 20th running all
    // 3 engines 2×/day. GitHub now runs ONLY the daily engine ≈900 min/mo;
    // CircleCI covers funnel2+foreign ≈2,100 of its 6,000 free min/mo.)
    // The watchdog sees no GitHub SUCCESS for run_funnel2/run_foreign and
    // triggers the CircleCI mirror for them every morning. Nothing to do here.
    const funnel2: any = { skipped: true, reason: "runs on CircleCI via watchdog (GitHub minutes reserved for daily engine)" };
    console.log("kick-engine funnel2:", JSON.stringify(funnel2));
    // ---- CIRCLECI OVERFLOW WATCHDOG (never fatal) -----------------------
    // If any engine workflow missed SUCCESS yesterday (quota exhaustion,
    // outage, …), run the same jobs on CircleCI so leads keep flowing.
    // Dormant when GitHub is healthy.
    let overflow: any = { checked: false };
    try {
      const { githubEngineSuccessYesterday, triggerCircleCIOverflow, OVERFLOW_WORKFLOWS } =
        await import("@/lib/outreach/circleci-overflow");
      const y = await githubEngineSuccessYesterday(ghToken);
      overflow = { checked: y.ok, date: y.date, github: y.success };
      if (!y.ok) {
        overflow.check = y.error;
      } else {
        const missing = OVERFLOW_WORKFLOWS.filter((w) => !y.success[w.param]).map((w) => w.param);
        if (missing.length === 0) {
          overflow.overflow = { skipped: "github healthy" };
        } else {
          const cci = (process.env.CIRCLECI_API_TOKEN || "").trim();
          if (!cci) {
            overflow.overflow = { skipped: "CIRCLECI_API_TOKEN not set", missing };
          } else {
            const t = await triggerCircleCIOverflow(cci, {
              run_daily: missing.includes("run_daily"),
              run_funnel2: missing.includes("run_funnel2"),
              run_foreign: missing.includes("run_foreign"),
              send: "1",
            });
            overflow.overflow = { missing, ...t };
          }
        }
      }
    } catch (e: any) {
      overflow = { checked: false, error: String(e?.message || e).slice(0, 120) };
    }
    console.log("kick-engine overflow:", JSON.stringify(overflow));
    await recordHeartbeat("cron_kick_engine", "ok", { dispatched: ENGINE_WORKFLOW_ID, funnel2, overflow });
    return Response.json({ ok: true, dispatched: ENGINE_WORKFLOW_ID, funnel2, overflow, at: new Date().toISOString() });
  } catch (e: any) {
    console.error("kick-engine error:", e.message);
    await recordHeartbeat("cron_kick_engine", "error", {});
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}
