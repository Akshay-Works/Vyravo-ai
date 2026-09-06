import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";

export const dynamic = "force-dynamic";

const GH_OWNER = process.env.FOREIGN_GH_OWNER || "Akshay-Works";
const GH_REPO = process.env.FOREIGN_GH_REPO || "vyravo-lead-engine";
const WORKFLOW = "foreign-daily.yml";

// POST /api/admin/foreign/run  body: { mode: "run" | "test" }
// Dispatches the GitHub Actions workflow via GH_PAT (a fine-grained PAT
// with Actions:write on the engine repo, stored as a server env var).
// If GH_PAT is not set, returns the Actions URL so the admin can click
// instead — the button never fails silently.
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const pat = (process.env.GH_PAT || "").trim();
  const body = await request.json().catch(() => ({}));
  const mode = body.mode === "test" ? "test" : "run";
  if (!pat) {
    return Response.json({
      ok: false,
      error: "GH_PAT not configured — open the Actions page to dispatch",
      actionsUrl: `https://github.com/${GH_OWNER}/${GH_REPO}/actions/workflows/${WORKFLOW}`,
    }, { status: 200 });
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${pat}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
      body: JSON.stringify({
        ref: "main",
        inputs: mode === "test" ? { force_run: true, test: true } : { force_run: false, test: false },
      }),
    });
    if (!res.ok) {
      return Response.json({ ok: false, error: `GitHub dispatch failed: ${res.status}` }, { status: 502 });
    }
    return Response.json({ ok: true, dispatched: true, mode, workflow: WORKFLOW });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
