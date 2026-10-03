import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import {
  getCareerOverview, listCareerJobs, getCareerJob, listApplications,
  runCareerDaily, setApplicationStatus, preparePackages,
} from "@/lib/career/pipeline";
import { getCareerProfile, getCareerPreferences, saveCareerProfile, saveCareerPreferences } from "@/lib/career/profile";
import { generateDocsForJob } from "@/lib/career/documents";
import { pool } from "@/db";
import { careerLog } from "@/lib/career/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function gate() {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export async function GET(request: NextRequest) {
  const g = await gate();
  if (g) return g;
  const u = new URL(request.url);
  const tab = u.searchParams.get("tab") || "overview";
  try {
    if (tab === "overview") return Response.json({ ok: true, ...(await getCareerOverview()), profile: await getCareerProfile(), prefs: await getCareerPreferences() });
    if (tab === "jobs") {
      const { rows, total } = await listCareerJobs({
        q: u.searchParams.get("q") || undefined,
        status: u.searchParams.get("status") || undefined,
        minScore: u.searchParams.get("min") ? Number(u.searchParams.get("min")) : undefined,
        offset: Number(u.searchParams.get("offset") || 0),
      });
      return Response.json({ ok: true, rows, total });
    }
    if (tab === "job") {
      const id = Number(u.searchParams.get("id"));
      const job = await getCareerJob(id);
      if (!job) return Response.json({ error: "not found" }, { status: 404 });
      return Response.json({ ok: true, job });
    }
    if (tab === "apps") return Response.json({ ok: true, rows: await listApplications(u.searchParams.get("status") || undefined) });
    if (tab === "docs") {
      const jobId = Number(u.searchParams.get("jobId"));
      const rows = (await pool.query(`SELECT id, kind, version, approved, body, created_at FROM career_documents WHERE job_id=$1 ORDER BY id DESC LIMIT 20`, [jobId])).rows;
      return Response.json({ ok: true, rows });
    }
    if (tab === "logs") {
      const rows = (await pool.query(`SELECT * FROM career_activity_logs ORDER BY id DESC LIMIT 80`)).rows;
      const runs = (await pool.query(`SELECT * FROM career_search_runs ORDER BY id DESC LIMIT 20`)).rows;
      return Response.json({ ok: true, rows, runs });
    }
    if (tab === "profile") return Response.json({ ok: true, profile: await getCareerProfile(), prefs: await getCareerPreferences() });
    return Response.json({ error: "unknown tab" }, { status: 400 });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e).slice(0, 300) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const g = await gate();
  if (g) return g;
  const b = await request.json().catch(() => ({}));
  try {
    switch (String(b.action)) {
      case "run_now":
        return Response.json({ ok: true, ...(await runCareerDaily({ budgetMs: 45000 })) });
      case "save_profile":
        return Response.json({ ok: true, profile: await saveCareerProfile(b) });
      case "save_prefs":
        return Response.json({ ok: true, prefs: await saveCareerPreferences(b) });
      case "generate_docs":
        return Response.json({ ok: true, ...(await generateDocsForJob(Number(b.jobId), b.applicationId || null)) });
      case "prepare":
        return Response.json({ ok: true, ...(await preparePackages(Number(b.limit) || 5)) });
      case "status":
        await setApplicationStatus(Number(b.id), String(b.status), b.notes);
        return Response.json({ ok: true });
      case "shortlist":
        await pool.query(`UPDATE career_jobs SET shortlisted=$2, status = CASE WHEN $2 THEN 'shortlisted' ELSE status END WHERE id=$1`, [Number(b.jobId), !!b.on]);
        await careerLog("shortlist", "job", b.jobId, { on: !!b.on });
        return Response.json({ ok: true });
      case "mark_applied":
        await setApplicationStatus(Number(b.id), "submitted", b.notes || "Marked submitted after applying on the official listing.");
        return Response.json({ ok: true });
      default:
        return Response.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e).slice(0, 300) }, { status: 400 });
  }
}
