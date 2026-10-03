import { pool } from "@/db";
import { ensureCareerSchema } from "./schema";

const MASTER_RESUME = `AKSHAY NAVALE
Pune, Maharashtra, India | +91 90757 07650 | akshaynavale20janak@gmail.com
linkedin.com/in/iamakshaynavale | github.com/Akshay-Works | vyravo-ai.vercel.app

Founder of Vyravo AI (AI automation practice) and BrandNest Studio (creative services).
BSc Computer Science, Modern College of Arts, Science and Commerce, Pune (2021–2024).

EXPERIENCE
Vyravo AI — Founder | Pune | August 2026 – Present
- Design, build and operate AI automation systems: website knowledge-base chatbot, CRM pipelines, email automation, discovery-call automation, lead-generation and sales-ops dashboards.
- HubSpot CRM lifecycle, lead qualification/routing, follow-up sequences, reply tracking.
- Lead discovery via OpenStreetMap and Geoapify with validation, deduplication and CRM ingestion.
- Stack: Next.js, TypeScript, PostgreSQL, GitHub, Vercel, Calendly, Resend, OpenAI API. AI-assisted development.
- Delivered paid automation engagements for a small number of external clients.

BrandNest Studio — Founder | Pune | December 2025 – Present
- Creative-services line operated separately from Vyravo AI: scoping, delivery, payments, client records.

CCTV & Security Systems — Owner (part-time) | Pune | 2025
- Customer acquisition, pricing, installation coordination and handover.

PROJECTS (live unless noted)
- AI knowledge-base chatbot on vyravo-ai.vercel.app (production).
- Four-step discovery-call funnel: intake, AI recommendations, scheduling, confirmation emails.
- Sales operations command centre: pipeline reporting, approvals, scheduled reports, RBAC.
- Lead-generation pipeline (OSM + Geoapify).
- Healthcare enquiry prototype for a Pune laparoscopy centre — demo/synthetic data only, no live integrations.

CERTIFICATIONS (2024–2025, verifiable on request)
IBM Applied DevOps Engineering; DevOps on AWS; Google Cloud; Cisco network automation.
Coursework: github.com/akshay20n

MISSING / DO NOT INVENT
- Target CTC / minimum monthly salary (set in CareerPilot settings)
- Notice period / joining date
- Named client revenue, headcount, or performance KPIs not in this resume
`;

const SEED_PROFILE = {
  full_name: "Akshay Navale",
  email: "akshaynavale20janak@gmail.com",
  phone: "+91 90757 07650",
  location: "Pune, Maharashtra, India",
  linkedin: "https://linkedin.com/in/iamakshaynavale",
  github: "https://github.com/Akshay-Works",
  website: "https://vyravo-ai.vercel.app",
  headline: "AI Automation Specialist · CRM / RevOps · Technical Implementation",
  summary: "Founder of Vyravo AI and BrandNest Studio. Builds and operates AI chatbots, HubSpot CRM pipelines, lead-generation workflows and internal ops tooling. BSc Computer Science (2024). Seeking AI automation, business operations, CRM/RevOps or implementation roles in Pune or remote.",
  skills: [
    "HubSpot CRM", "Workflow automation", "AI chatbots", "Lead generation", "SQL / PostgreSQL",
    "Next.js", "TypeScript", "REST APIs / webhooks", "Calendly", "Resend", "GitHub", "Vercel",
    "Process mapping", "KPI dashboards", "Role-based access", "OpenStreetMap / Geoapify",
  ],
  experience: [
    { org: "Vyravo AI", title: "Founder", dates: "August 2026 – Present", location: "Pune, India" },
    { org: "BrandNest Studio", title: "Founder", dates: "December 2025 – Present", location: "Pune, India" },
    { org: "CCTV & Security Systems", title: "Owner (part-time)", dates: "2025", location: "Pune, India" },
  ],
  education: [
    { school: "Modern College of Arts, Science and Commerce, Pune", credential: "BSc Computer Science", dates: "2021 – 2024" },
  ],
  certifications: [
    { name: "Applied DevOps Engineering — IBM", dates: "2024–2025" },
    { name: "DevOps on AWS — Amazon Web Services", dates: "2024–2025" },
    { name: "Google Cloud professional certificate", dates: "2024–2025" },
    { name: "Cisco network automation certificate", dates: "2024–2025" },
  ],
  projects: [
    "AI knowledge-base chatbot (production, vyravo-ai.vercel.app)",
    "Automated discovery-call funnel (qualification + Calendly + email)",
    "Sales operations command centre",
    "OSM/Geoapify lead-generation pipeline",
    "Healthcare enquiry prototype (demo / synthetic data only)",
  ],
  missing_fields: [
    "minimum monthly compensation",
    "preferred annual CTC",
    "notice period / joining availability",
    "named client revenue or headcount (not in resume)",
  ],
  master_resume: MASTER_RESUME,
};

const SEED_PREFS = {
  locations: ["Pune, Maharashtra, India", "India remote", "Indian cities hybrid"],
  work_modes: ["remote", "hybrid"],
  employment_types: ["full-time", "contract"],
  target_roles: [
    "AI Automation Specialist", "AI Implementation Specialist", "AI Solutions Associate",
    "Business Operations Associate", "Business Operations Analyst", "Revenue Operations Associate",
    "CRM Specialist", "CRM Administrator", "Sales Operations Specialist",
    "Business Development Associate", "Automation Consultant",
    "Customer Success / Implementation Associate", "No-code / Low-code Automation Specialist",
  ],
  include_keywords: ["automation", "crm", "hubspot", "revops", "operations", "implementation", "chatbot", "workflow"],
  exclude_keywords: ["unpaid internship", "crypto trader"],
  excluded_companies: [],
  preferred_industries: ["SaaS", "B2B software", "agencies", "AI / automation"],
  report_email: "",
  min_monthly_inr: null,
  preferred_ctc_inr: null,
  notice_period: "",
  joining_availability: "",
};

export async function seedCareerIfEmpty(): Promise<void> {
  await ensureCareerSchema();
  const p = await pool.query(`SELECT id FROM career_profile WHERE id = 1`);
  if ((p.rowCount ?? 0) === 0) {
    await pool.query(
      `INSERT INTO career_profile (id, full_name, email, phone, location, linkedin, github, website, headline, summary,
        skills, experience, education, certifications, projects, master_resume, missing_fields)
       VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15,$16::jsonb)`,
      [SEED_PROFILE.full_name, SEED_PROFILE.email, SEED_PROFILE.phone, SEED_PROFILE.location,
        SEED_PROFILE.linkedin, SEED_PROFILE.github, SEED_PROFILE.website, SEED_PROFILE.headline, SEED_PROFILE.summary,
        JSON.stringify(SEED_PROFILE.skills), JSON.stringify(SEED_PROFILE.experience),
        JSON.stringify(SEED_PROFILE.education), JSON.stringify(SEED_PROFILE.certifications),
        JSON.stringify(SEED_PROFILE.projects), SEED_PROFILE.master_resume, JSON.stringify(SEED_PROFILE.missing_fields)]);
  }
  const pr = await pool.query(`SELECT id FROM career_preferences WHERE id = 1`);
  if ((pr.rowCount ?? 0) === 0) {
    await pool.query(
      `INSERT INTO career_preferences (id, locations, work_modes, employment_types, target_roles, include_keywords,
        exclude_keywords, excluded_companies, preferred_industries, report_email, auto_submit, approval_mode)
       VALUES (1,$1::jsonb,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9,false,'review_first')`,
      [JSON.stringify(SEED_PREFS.locations), JSON.stringify(SEED_PREFS.work_modes),
        JSON.stringify(SEED_PREFS.employment_types), JSON.stringify(SEED_PREFS.target_roles),
        JSON.stringify(SEED_PREFS.include_keywords), JSON.stringify(SEED_PREFS.exclude_keywords),
        JSON.stringify(SEED_PREFS.excluded_companies), JSON.stringify(SEED_PREFS.preferred_industries),
        SEED_PREFS.report_email]);
  }
}

export async function getCareerProfile(): Promise<any> {
  await seedCareerIfEmpty();
  return (await pool.query(`SELECT * FROM career_profile WHERE id = 1`)).rows[0];
}

export async function getCareerPreferences(): Promise<any> {
  await seedCareerIfEmpty();
  return (await pool.query(`SELECT * FROM career_preferences WHERE id = 1`)).rows[0];
}

export async function saveCareerProfile(patch: any): Promise<any> {
  await seedCareerIfEmpty();
  const cur = await getCareerProfile();
  const next = { ...cur, ...patch, updated_at: new Date() };
  await pool.query(
    `UPDATE career_profile SET full_name=$2, email=$3, phone=$4, location=$5, linkedin=$6, github=$7, website=$8,
       headline=$9, summary=$10, skills=$11::jsonb, experience=$12::jsonb, education=$13::jsonb,
       certifications=$14::jsonb, projects=$15::jsonb, master_resume=$16, missing_fields=$17::jsonb,
       approved_at = CASE WHEN $18 THEN now() ELSE approved_at END, updated_at=now()
     WHERE id=1`,
    [1, next.full_name, next.email, next.phone, next.location, next.linkedin, next.github, next.website,
      next.headline, next.summary, JSON.stringify(next.skills || []), JSON.stringify(next.experience || []),
      JSON.stringify(next.education || []), JSON.stringify(next.certifications || []),
      JSON.stringify(next.projects || []), next.master_resume || "", JSON.stringify(next.missing_fields || []),
      !!patch.approve]);
  return getCareerProfile();
}

export async function saveCareerPreferences(patch: any): Promise<any> {
  await seedCareerIfEmpty();
  const cur = await getCareerPreferences();
  const next = { ...cur, ...patch };
  await pool.query(
    `UPDATE career_preferences SET min_monthly_inr=$2::integer, preferred_ctc_inr=$3::integer, locations=$4::jsonb, work_modes=$5::jsonb,
       employment_types=$6::jsonb, notice_period=$7, joining_availability=$8, experience_level=$9,
       preferred_industries=$10::jsonb, excluded_companies=$11::jsonb, include_keywords=$12::jsonb,
       exclude_keywords=$13::jsonb, target_roles=$14::jsonb, daily_application_target=$15,
       approval_mode=$16, auto_submit=$17, report_email=$18, weights=$19::jsonb, updated_at=now()
     WHERE id=$1`,
    [1,
      next.min_monthly_inr === "" || next.min_monthly_inr == null ? null : Number(next.min_monthly_inr),
      next.preferred_ctc_inr === "" || next.preferred_ctc_inr == null ? null : Number(next.preferred_ctc_inr), JSON.stringify(next.locations || []),
      JSON.stringify(next.work_modes || []), JSON.stringify(next.employment_types || []),
      next.notice_period || "", next.joining_availability || "", next.experience_level || "junior-mid",
      JSON.stringify(next.preferred_industries || []), JSON.stringify(next.excluded_companies || []),
      JSON.stringify(next.include_keywords || []), JSON.stringify(next.exclude_keywords || []),
      JSON.stringify(next.target_roles || []), Math.max(1, Math.min(20, Number(next.daily_application_target) || 5)),
      next.approval_mode === "auto_authorized" ? "auto_authorized" : "review_first",
      false, // never silently enable auto_submit
      next.report_email || "", JSON.stringify(next.weights || {})]);
  return getCareerPreferences();
}

export function profileForScore(p: any) {
  return {
    skills: Array.isArray(p.skills) ? p.skills.map(String) : [],
    projects: Array.isArray(p.projects) ? p.projects.map(String) : [],
    experience: Array.isArray(p.experience) ? p.experience.map((e: any) => typeof e === "string" ? e : `${e.title} ${e.org}`) : [],
    location: p.location || "",
    headline: p.headline || "",
    summary: p.summary || "",
  };
}
