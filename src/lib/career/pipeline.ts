import { pool } from "@/db";
import { careerLog, ensureCareerSchema } from "./schema";
import { getCareerPreferences, getCareerProfile, profileForScore, seedCareerIfEmpty } from "./profile";
import { fetchAllSources, indiaOrRemoteOk, looksRelevant, type RawJob } from "./discover";
import { scoreJob, shouldAutoReject, DEFAULT_WEIGHTS } from "./score";
import { generateDocsForJob } from "./documents";

function canon(url: string): string {
  return String(url || "").trim().toLowerCase().replace(/\/+$/, "").split("?")[0];
}

export async function ingestJobs(raw: RawJob[], prefs: any, profile: any): Promise<{ inserted: number; duplicates: number; scored: number }> {
  let inserted = 0, duplicates = 0, scored = 0;
  const weights = { ...DEFAULT_WEIGHTS, ...(prefs.weights || {}) };
  const pfs = profileForScore(profile);
  for (const j of raw) {
    if (!j.title || !j.source_id) continue;
    if (!looksRelevant(j, prefs.include_keywords || [])) continue;
    if (!indiaOrRemoteOk(j)) continue;
    const reject = shouldAutoReject(j, prefs);
    if (reject) continue;
    const url = canon(j.canonical_url || j.apply_url);
    const exists = await pool.query(
      `SELECT id FROM career_jobs WHERE (source=$1 AND source_id=$2) OR (canonical_url <> '' AND canonical_url=$3) LIMIT 1`,
      [j.source, j.source_id, url]);
    if ((exists.rowCount ?? 0) > 0) { duplicates++; continue; }
    const s = scoreJob(j, pfs, weights, {
      locations: prefs.locations, work_modes: prefs.work_modes,
      min_monthly_inr: prefs.min_monthly_inr, excluded_companies: prefs.excluded_companies,
    });
    const shortlisted = s.score >= 55;
    await pool.query(
      `INSERT INTO career_jobs (source, source_id, canonical_url, title, company, location, work_mode, employment_type,
         salary_text, description, posted_at, apply_url, match_score, match_breakdown, match_reasons, concerns, shortlisted, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18)
       ON CONFLICT (source, source_id) DO NOTHING`,
      [j.source, j.source_id, url, j.title, j.company, j.location, j.work_mode, j.employment_type,
        j.salary_text, j.description, j.posted_at, j.apply_url || url, s.score, JSON.stringify(s.breakdown),
        s.reasons, s.concerns, shortlisted, shortlisted ? "shortlisted" : "discovered"]);
    inserted++;
    scored++;
  }
  return { inserted, duplicates, scored };
}

export async function preparePackages(limit: number): Promise<{ prepared: number }> {
  const jobs = await pool.query(
    `SELECT j.* FROM career_jobs j
     WHERE j.shortlisted = true AND j.expired = false
       AND NOT EXISTS (SELECT 1 FROM career_applications a WHERE a.job_id = j.id)
     ORDER BY j.match_score DESC NULLS LAST, j.id DESC
     LIMIT $1`, [Math.max(1, Math.min(20, limit))]);
  let prepared = 0;
  for (const j of jobs.rows) {
    const key = `job:${j.source}:${j.source_id}`;
    const ins = await pool.query(
      `INSERT INTO career_applications (job_id, status, idempotency_key, follow_up_due)
       VALUES ($1,'awaiting_approval',$2, now() + interval '5 days')
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
      [j.id, key]);
    if ((ins.rowCount ?? 0) === 0) continue;
    const appId = ins.rows[0].id;
    await generateDocsForJob(j.id, appId);
    await pool.query(`UPDATE career_jobs SET status='awaiting_approval' WHERE id=$1`, [j.id]);
    await careerLog("package_prepared", "job", j.id, { application_id: appId, score: j.match_score });
    prepared++;
  }
  return { prepared };
}

export async function runCareerDaily(opts: { budgetMs?: number } = {}): Promise<any> {
  const t0 = Date.now();
  const budget = opts.budgetMs ?? 25000;
  await ensureCareerSchema();
  await seedCareerIfEmpty();
  const run = await pool.query(`INSERT INTO career_search_runs (status) VALUES ('running') RETURNING id`);
  const runId = run.rows[0].id;
  try {
    const prefs = await getCareerPreferences();
    const profile = await getCareerProfile();
    const { jobs, sources } = await fetchAllSources();
    if (Date.now() - t0 > budget) {
      await pool.query(`UPDATE career_search_runs SET status='truncated', completed_at=now(), sources=$2::jsonb, errors='budget' WHERE id=$1`,
        [runId, JSON.stringify(sources)]);
      return { ok: true, truncated: true, sources, runId };
    }
    const ing = await ingestJobs(jobs, prefs, profile);
    const pkg = await preparePackages(Number(prefs.daily_application_target) || 5);
    const shortlisted = (await pool.query(`SELECT count(*)::int n FROM career_jobs WHERE shortlisted AND discovered_at::date = CURRENT_DATE`)).rows[0].n;
    await pool.query(
      `UPDATE career_search_runs SET status='ok', completed_at=now(), sources=$2::jsonb, discovered=$3, duplicates=$4, shortlisted=$5 WHERE id=$1`,
      [runId, JSON.stringify(sources), ing.inserted, ing.duplicates, shortlisted]);
    await careerLog("search_run", "run", runId, { sources, ...ing, ...pkg });
    return { ok: true, runId, sources, ...ing, ...pkg, shortlisted, ms: Date.now() - t0 };
  } catch (e: any) {
    const err = String(e?.message || e).slice(0, 400);
    await pool.query(`UPDATE career_search_runs SET status='error', completed_at=now(), errors=$2 WHERE id=$1`, [runId, err]);
    await careerLog("search_error", "run", runId, { error: err });
    return { ok: false, runId, error: err };
  }
}

export async function getCareerOverview(): Promise<any> {
  await seedCareerIfEmpty();
  const one = async (sql: string) => (await pool.query(sql)).rows[0] || {};
  const today = await one(`SELECT
      count(*) FILTER (WHERE discovered_at::date = CURRENT_DATE)::int AS discovered_today,
      count(*) FILTER (WHERE discovered_at > now() - interval '7 days')::int AS week,
      count(*) FILTER (WHERE shortlisted)::int AS shortlisted,
      count(*) FILTER (WHERE expired)::int AS expired
    FROM career_jobs`);
  const apps = await one(`SELECT
      count(*) FILTER (WHERE status='awaiting_approval')::int AS pending_approval,
      count(*) FILTER (WHERE status='submitted')::int AS submitted,
      count(*) FILTER (WHERE status IN ('submitted','recruiter_viewed','assessment','interview_scheduled','interview_completed'))::int AS awaiting_response,
      count(*) FILTER (WHERE follow_up_due IS NOT NULL AND follow_up_due::date <= CURRENT_DATE AND status NOT IN ('withdrawn','closed','rejected','expired'))::int AS followups_due,
      count(*) FILTER (WHERE status='interview_scheduled')::int AS interviews,
      count(*) FILTER (WHERE status='offer')::int AS offers
    FROM career_applications`);
  const last = (await pool.query(`SELECT * FROM career_search_runs ORDER BY id DESC LIMIT 1`)).rows[0] || null;
  const lastOk = (await pool.query(`SELECT * FROM career_search_runs WHERE status='ok' ORDER BY id DESC LIMIT 1`)).rows[0] || null;
  return { today, apps, lastRun: last, lastOk };
}

export async function listCareerJobs(opts: { q?: string; status?: string; minScore?: number; limit?: number; offset?: number } = {}): Promise<{ rows: any[]; total: number }> {
  await seedCareerIfEmpty();
  const conds: string[] = ["expired = false"];
  const args: any[] = [];
  if (opts.status) { args.push(opts.status); conds.push(`status = $${args.length}`); }
  if (opts.minScore != null) { args.push(opts.minScore); conds.push(`match_score >= $${args.length}`); }
  if (opts.q) {
    args.push(`%${opts.q.slice(0, 80)}%`);
    conds.push(`(title ILIKE $${args.length} OR company ILIKE $${args.length} OR location ILIKE $${args.length})`);
  }
  const where = `WHERE ${conds.join(" AND ")}`;
  const total = (await pool.query(`SELECT count(*)::int n FROM career_jobs ${where}`, args)).rows[0].n;
  const limit = Math.min(100, Math.max(1, opts.limit || 50));
  const offset = Math.max(0, opts.offset || 0);
  args.push(limit, offset);
  const rows = (await pool.query(
    `SELECT id, source, title, company, location, work_mode, salary_text, match_score, shortlisted, status, apply_url, posted_at, discovered_at, concerns
     FROM career_jobs ${where} ORDER BY match_score DESC NULLS LAST, id DESC LIMIT $${args.length - 1} OFFSET $${args.length}`,
    args)).rows;
  return { rows, total };
}

export async function getCareerJob(id: number): Promise<any | null> {
  const j = (await pool.query(`SELECT * FROM career_jobs WHERE id=$1`, [id])).rows[0];
  if (!j) return null;
  const docs = (await pool.query(`SELECT id, kind, version, approved, created_at, left(body, 80) AS preview FROM career_documents WHERE job_id=$1 ORDER BY id DESC`, [id])).rows;
  const apps = (await pool.query(`SELECT * FROM career_applications WHERE job_id=$1 ORDER BY id DESC`, [id])).rows;
  return { ...j, documents: docs, applications: apps };
}

export async function listApplications(status?: string): Promise<any[]> {
  const cond = status ? `WHERE a.status = $1` : "";
  const args = status ? [status] : [];
  return (await pool.query(
    `SELECT a.*, j.title, j.company, j.match_score, j.apply_url, j.location
     FROM career_applications a JOIN career_jobs j ON j.id = a.job_id
     ${cond} ORDER BY a.id DESC LIMIT 100`, args)).rows;
}

export async function setApplicationStatus(id: number, status: string, notes?: string): Promise<void> {
  const allowed = new Set([
    "discovered", "under_review", "shortlisted", "documents_generated", "awaiting_approval", "approved",
    "ready_to_apply", "in_progress", "submitted", "submission_unknown", "recruiter_viewed", "assessment",
    "interview_scheduled", "interview_completed", "offer", "rejected", "withdrawn", "closed", "expired", "follow_up_due",
  ]);
  if (!allowed.has(status)) throw new Error("bad status");
  const extra = status === "submitted" ? `, submitted_at = coalesce(submitted_at, now()), submit_result = 'manual_confirmed'` : "";
  await pool.query(
    `UPDATE career_applications SET status=$2, notes = CASE WHEN $3='' THEN notes ELSE $3 END, updated_at=now() ${extra} WHERE id=$1`,
    [id, status, notes || ""]);
  await careerLog("status", "application", id, { status });
}
