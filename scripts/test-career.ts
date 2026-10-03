// CareerPilot unit tests. Run: npx tsx scripts/test-career.ts
import { pool } from "@/db";
import { scoreJob, shouldAutoReject, DEFAULT_WEIGHTS } from "@/lib/career/score";
import { ensureCareerSchema } from "@/lib/career/schema";
import { seedCareerIfEmpty, getCareerProfile, getCareerPreferences, saveCareerPreferences } from "@/lib/career/profile";
import { ingestJobs } from "@/lib/career/pipeline";
import { looksRelevant, indiaOrRemoteOk, type RawJob } from "@/lib/career/discover";

let pass = 0, fail = 0;
function ok(name: string, cond: any) {
  if (cond) { pass++; console.log("PASS", name); }
  else { fail++; console.log("FAIL", name); }
}

const profile = {
  skills: ["HubSpot CRM", "Workflow automation", "AI chatbots", "Next.js"],
  projects: ["AI knowledge-base chatbot", "OSM lead-generation pipeline"],
  experience: ["Founder Vyravo AI"],
  location: "Pune, Maharashtra, India",
  headline: "AI Automation Specialist",
  summary: "Founder of Vyravo AI building HubSpot CRM and chatbots",
};

async function main() {
  const s1 = scoreJob({
    title: "CRM Operations Specialist",
    company: "Acme SaaS",
    location: "Remote - India",
    work_mode: "remote",
    salary_text: "",
    description: "HubSpot CRM, lifecycle automation, reporting dashboards, workflows.",
  }, profile);
  ok("undisclosed salary still scores", s1.score >= 40 && s1.breakdown.compensation.assessed === false);
  ok("crm job matches hubspot skill", s1.matching.some((m) => m.includes("hubspot") || m.includes("crm")));

  const s2 = scoreJob({
    title: "Principal Engineer",
    company: "BigCo",
    location: "San Francisco",
    work_mode: "onsite",
    salary_text: "",
    description: "Must be located in the United States. 10+ years. Staff/principal.",
  }, profile);
  ok("us-only senior scores lower", s2.score < s1.score);

  ok("unpaid intern rejected", !!shouldAutoReject({
    title: "Unpaid intern", company: "x", location: "", work_mode: "", salary_text: "", description: "unpaid internship",
  } as any, { exclude_keywords: [] }));

  await pool.query(`DELETE FROM career_jobs WHERE source='career-test'`);
  const job: RawJob = {
    source: "career-test", source_id: `t-${Date.now()}`, canonical_url: `https://example.com/job/career-test-${Date.now()}`,
    title: "AI Automation Specialist", company: "TestCo", location: "Pune, India", work_mode: "hybrid",
    employment_type: "full-time", salary_text: "", description: "HubSpot CRM automation chatbot workflows",
    posted_at: new Date(), apply_url: "https://example.com/job/career-test-1",
  };
  ok("relevant role", looksRelevant(job, ["automation"]));
  ok("india ok", indiaOrRemoteOk(job));

  await ensureCareerSchema();
  await seedCareerIfEmpty();
  const p = await getCareerProfile();
  ok("profile seeded with real name", p.full_name === "Akshay Navale");
  ok("salary not invented", (await getCareerPreferences()).min_monthly_inr == null);

  const prefs = await getCareerPreferences();
  const a = await ingestJobs([job], prefs, p);
  ok("ingest inserts", a.inserted === 1);
  const b = await ingestJobs([job], prefs, p);
  ok("duplicate skipped", b.duplicates >= 1 && b.inserted === 0);

  await saveCareerPreferences({ min_monthly_inr: "", preferred_ctc_inr: "" });
  ok("blank salary stays null", (await getCareerPreferences()).min_monthly_inr == null);

  await pool.query(`DELETE FROM career_jobs WHERE source='career-test'`);
  console.log(`\nCAREER: ${pass} passed, ${fail} failed`);
  await pool.end();
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => { console.error("FATAL", e); try { await pool.end(); } catch {} process.exit(1); });
