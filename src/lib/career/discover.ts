export interface RawJob {
  source: string;
  source_id: string;
  canonical_url: string;
  title: string;
  company: string;
  location: string;
  work_mode: string;
  employment_type: string;
  salary_text: string;
  description: string;
  posted_at: Date | null;
  apply_url: string;
}

function absUrl(u: string): string {
  const s = String(u || "").trim();
  if (!s) return "";
  if (s.startsWith("http")) return s.split("?")[0];
  return s;
}

async function getJson(url: string): Promise<any> {
  const r = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "CareerPilot/1.0 (+https://vyravo-ai.vercel.app)" },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}

export async function fetchRemoteOK(): Promise<RawJob[]> {
  const j = await getJson("https://remoteok.com/api");
  const rows = Array.isArray(j) ? j : [];
  const out: RawJob[] = [];
  for (const x of rows) {
    if (!x || !x.id || !x.position) continue;
    const tags = Array.isArray(x.tags) ? x.tags.join(" ") : "";
    out.push({
      source: "remoteok",
      source_id: String(x.id),
      canonical_url: absUrl(x.url || x.apply_url || `https://remoteok.com/remote-jobs/${x.id}`),
      title: String(x.position || "").slice(0, 200),
      company: String(x.company || "").slice(0, 160),
      location: String(x.location || "Remote").slice(0, 160),
      work_mode: "remote",
      employment_type: "full-time",
      salary_text: [x.salary_min, x.salary_max].filter(Boolean).join("–") || "",
      description: `${x.description || ""} ${tags}`.slice(0, 8000),
      posted_at: x.date ? new Date(x.date) : (x.epoch ? new Date(Number(x.epoch) * 1000) : null),
      apply_url: absUrl(x.apply_url || x.url || ""),
    });
  }
  return out;
}

export async function fetchRemotive(): Promise<RawJob[]> {
  const j = await getJson("https://remotive.com/api/remote-jobs?search=automation");
  const rows = Array.isArray(j.jobs) ? j.jobs : [];
  return rows.slice(0, 80).map((x: any) => ({
    source: "remotive",
    source_id: String(x.id),
    canonical_url: absUrl(x.url || x.short_url || ""),
    title: String(x.title || "").slice(0, 200),
    company: String(x.company_name || "").slice(0, 160),
    location: String(x.candidate_required_location || "Remote").slice(0, 160),
    work_mode: "remote",
    employment_type: String(x.job_type || "full-time").slice(0, 40),
    salary_text: String(x.salary || ""),
    description: String(x.description || "").slice(0, 8000),
    posted_at: x.publication_date ? new Date(x.publication_date) : null,
    apply_url: absUrl(x.url || ""),
  }));
}

export async function fetchArbeitnow(): Promise<RawJob[]> {
  const j = await getJson("https://www.arbeitnow.com/api/job-board-api");
  const rows = Array.isArray(j.data) ? j.data : [];
  return rows.slice(0, 80).map((x: any) => ({
    source: "arbeitnow",
    source_id: String(x.slug || x.url || Math.random()),
    canonical_url: absUrl(x.url || ""),
    title: String(x.title || "").slice(0, 200),
    company: String(x.company_name || "").slice(0, 160),
    location: String(x.location || "").slice(0, 160),
    work_mode: x.remote ? "remote" : "onsite",
    employment_type: Array.isArray(x.job_types) ? String(x.job_types[0] || "") : "",
    salary_text: "",
    description: `${x.description || ""} ${(x.tags || []).join(" ")}`.slice(0, 8000),
    posted_at: x.created_at ? new Date(Number(x.created_at) * 1000) : null,
    apply_url: absUrl(x.url || ""),
  }));
}

const ROLE_HINT = /automation|crm|hubspot|revops|revenue operations|sales operations|business operations|implementation|chatbot|workflow|no-?code|low-?code|customer success|business analyst|operations analyst|zapier|make\.com|n8n|onboarding specialist|solutions associate|ai specialist/i;

export function looksRelevant(job: RawJob, include: string[] = []): boolean {
  const blob = `${job.title} ${job.company} ${job.description}`.toLowerCase();
  if (ROLE_HINT.test(blob)) return true;
  return include.some((k) => k && blob.includes(k.toLowerCase()));
}

export function indiaOrRemoteOk(job: RawJob): boolean {
  const blob = `${job.location} ${job.work_mode} ${job.description} ${job.title}`.toLowerCase();
  if (/united states only|must be in the us|us citizen|no remote india|uk only onsite/.test(blob)) return false;
  if (/india|pune|bangalore|bengaluru|hyderabad|mumbai|delhi|chennai|remote|worldwide|anywhere|work from home/.test(blob)) return true;
  if (job.work_mode === "remote") return true;
  return false;
}

export async function fetchAllSources(): Promise<{ jobs: RawJob[]; sources: { name: string; ok: boolean; n: number; error?: string }[] }> {
  const sources: { name: string; ok: boolean; n: number; error?: string }[] = [];
  const jobs: RawJob[] = [];
  const run = async (name: string, fn: () => Promise<RawJob[]>) => {
    try {
      const rows = await fn();
      jobs.push(...rows);
      sources.push({ name, ok: true, n: rows.length });
    } catch (e: any) {
      sources.push({ name, ok: false, n: 0, error: String(e?.message || e).slice(0, 160) });
    }
  };
  await run("remoteok", fetchRemoteOK);
  await run("remotive", fetchRemotive);
  await run("arbeitnow", fetchArbeitnow);
  return { jobs, sources };
}
