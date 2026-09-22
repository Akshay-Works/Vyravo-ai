// ============================================================================
// CIRCLECI OVERFLOW — automatic failover when GitHub Actions can't run the
// engine (e.g. free-minutes quota exhausted). The Vercel kick-engine cron
// calls this every morning: if any of the 3 engine workflows has no SUCCESS
// for the previous UTC day, the same jobs are triggered on CircleCI
// (free 6,000 min/mo) via API. Dormant when GitHub is healthy (costs 0).
//
// CircleCI side: vyravo-lead-engine/.circleci/config.yml — API-trigger only,
// pushes never run jobs. Secrets live in CircleCI project settings.
// ============================================================================

const ENGINE_REPO = "Akshay-Works/Vyravo-Lead-Engine";

export const OVERFLOW_WORKFLOWS = [
  { gh: "Daily lead generation", param: "run_daily" },
  { gh: "Funnel 2 — LinkedIn & Email leads", param: "run_funnel2" },
  { gh: "Foreign lead engine (international B2B)", param: "run_foreign" },
] as const;

/** Which engine workflows reached SUCCESS during the previous UTC day. */
export async function githubEngineSuccessYesterday(
  ghToken: string
): Promise<{ ok: boolean; date: string; success: Record<string, boolean>; error?: string }> {
  const now = new Date();
  const yStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const date = yStart.toISOString().slice(0, 10);
  const success: Record<string, boolean> = {};
  for (const w of OVERFLOW_WORKFLOWS) success[w.param] = false;
  try {
    const r = await fetch(
      `https://api.github.com/repos/${ENGINE_REPO}/actions/runs?per_page=60`,
      {
        headers: { Authorization: `Bearer ${ghToken}`, Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!r.ok) return { ok: false, date, success, error: `github runs API ${r.status}` };
    const j = await r.json();
    for (const run of j.workflow_runs || []) {
      if (run.created_at < yStart.toISOString()) continue;
      if (run.conclusion !== "success") continue;
      const w = OVERFLOW_WORKFLOWS.find((x) => x.gh === run.name);
      if (w) success[w.param] = true;
    }
    return { ok: true, date, success };
  } catch (e: any) {
    return { ok: false, date, success, error: String(e?.message || e).slice(0, 120) };
  }
}

export interface OverflowParams {
  run_daily?: boolean;
  run_funnel2?: boolean;
  run_foreign?: boolean;
  send?: string; // "1" = queue+send (GitHub parity); "0" = queue only (first test)
  force_run?: string; // "1" = ignore the already-ran-today guard
}

/** Trigger the dormant CircleCI mirror. Returns the pipeline identity. */
export async function triggerCircleCIOverflow(
  circleToken: string,
  params: OverflowParams
): Promise<{ ok: boolean; id?: string; number?: number; error?: string }> {
  const slug = (process.env.CIRCLECI_PROJECT_SLUG || `gh/${ENGINE_REPO}`).trim();
  try {
    const r = await fetch(`https://circleci.com/api/v2/project/${slug}/pipeline`, {
      method: "POST",
      headers: {
        "Circle-Token": circleToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        branch: "main",
        parameters: {
          run_daily: !!params.run_daily,
          run_funnel2: !!params.run_funnel2,
          run_foreign: !!params.run_foreign,
          send: params.send === "0" ? "0" : "1",
          force_run: params.force_run === "1" ? "1" : "",
        },
      }),
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, error: `circleci ${r.status}: ${String(j.message || "").slice(0, 150)}` };
    }
    return { ok: true, id: j.id, number: j.number };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e).slice(0, 150) };
  }
}
