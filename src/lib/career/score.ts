export type Weights = {
  skills: number; projects: number; seniority: number;
  location: number; compensation: number; industry: number;
};

export const DEFAULT_WEIGHTS: Weights = {
  skills: 30, projects: 25, seniority: 15, location: 10, compensation: 10, industry: 10,
};

export interface ProfileForScore {
  skills: string[];
  projects: string[];
  experience: string[];
  location: string;
  headline?: string;
  summary?: string;
}

export interface JobForScore {
  title: string;
  company: string;
  location: string;
  work_mode: string;
  salary_text: string;
  description: string;
  employment_type?: string;
}

export interface ScoreResult {
  score: number;
  breakdown: Record<string, { points: number; max: number; note: string; assessed: boolean }>;
  matching: string[];
  missing: string[];
  reasons: string;
  concerns: string;
}

const SKILL_TERMS = [
  "hubspot", "crm", "automation", "workflow", "zapier", "make.com", "n8n", "openai",
  "chatbot", "knowledge-base", "knowledge base", "next.js", "typescript", "sql",
  "postgresql", "supabase", "vercel", "github", "calendly", "resend", "webhook",
  "lead generation", "sales operations", "revops", "revenue operations", "lifecycle",
  "pipeline", "reporting", "dashboard", "api", "integration", "no-code", "low-code",
  "business operations", "implementation", "onboarding", "process mapping",
];

function blob(j: JobForScore): string {
  return `${j.title} ${j.company} ${j.location} ${j.work_mode} ${j.salary_text} ${j.description}`.toLowerCase();
}

function hasAny(text: string, terms: string[]): string[] {
  return terms.filter((t) => text.includes(t.toLowerCase()));
}

export function scoreJob(job: JobForScore, profile: ProfileForScore, weights: Weights = DEFAULT_WEIGHTS, prefs?: {
  locations?: string[]; work_modes?: string[]; min_monthly_inr?: number | null; excluded_companies?: string[];
}): ScoreResult {
  const text = blob(job);
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  const matching: string[] = [];
  const missing: string[] = [];
  const concerns: string[] = [];

  const profileSkills = (profile.skills || []).map((s) => s.toLowerCase());
  const skillHits = SKILL_TERMS.filter((t) => text.includes(t) && (
    profileSkills.some((s) => s.includes(t) || t.includes(s.split(" ")[0] || "___"))
    || (profile.summary || "").toLowerCase().includes(t)
    || (profile.headline || "").toLowerCase().includes(t)
  ));
  const jobSkillMentions = SKILL_TERMS.filter((t) => text.includes(t));
  const skillRatio = jobSkillMentions.length ? skillHits.length / Math.min(8, jobSkillMentions.length) : 0.4;
  const skillsPts = Math.round(Math.min(1, skillRatio) * w.skills);
  skillHits.slice(0, 8).forEach((s) => matching.push(s));
  jobSkillMentions.filter((t) => !skillHits.includes(t)).slice(0, 5).forEach((t) => missing.push(t));

  const projectBlob = (profile.projects || []).join(" ").toLowerCase() + " " + (profile.experience || []).join(" ").toLowerCase();
  const projectTerms = ["chatbot", "crm", "hubspot", "lead", "pipeline", "automation", "funnel", "dashboard", "workflow", "integration"];
  const projHits = projectTerms.filter((t) => text.includes(t) && projectBlob.includes(t));
  const projectsPts = Math.round(Math.min(1, projHits.length / 4) * w.projects);

  const senior = /senior|staff|principal|director|head of|lead engineer|10\+ years|8\+ years/.test(text);
  const intern = /intern\b|internship|student/.test(text);
  let seniorityPts = Math.round(w.seniority * 0.75);
  let seniorityNote = "Associate / specialist / founder-operator level assumed a reasonable fit.";
  let seniorityAssessed = true;
  if (senior) {
    seniorityPts = Math.round(w.seniority * 0.25);
    seniorityNote = "Posting reads senior/lead; experience is founder-operator (2025–present), not 8–10 years in a corporate title.";
    concerns.push("Seniority may be above current employed-years.");
  } else if (intern) {
    seniorityPts = Math.round(w.seniority * 0.35);
    seniorityNote = "Internship-level posting.";
  }

  const loc = (job.location || "").toLowerCase();
  const mode = (job.work_mode || "").toLowerCase();
  const india = /india|pune|maharashtra|bengaluru|bangalore|hyderabad|mumbai|delhi|remote/.test(loc + " " + text);
  const usOnly = /must be (located )?in the (us|united states|uk)|no visa|citizens only|gstin not/.test(text);
  const remoteOk = /remote|anywhere|worldwide|work from home/.test(loc + " " + mode + " " + text);
  let locationPts = 0;
  let locationNote = "";
  let locationAssessed = true;
  if (usOnly && !india) {
    locationPts = 0;
    locationNote = "Looks restricted to US/UK on-site or local hire.";
    concerns.push("May not hire in India.");
  } else if (/pune/.test(loc + " " + text)) {
    locationPts = w.location;
    locationNote = "Pune mentioned.";
  } else if (remoteOk || india) {
    locationPts = Math.round(w.location * 0.85);
    locationNote = remoteOk ? "Remote / India-friendly language." : "India location.";
  } else {
    locationPts = Math.round(w.location * 0.4);
    locationNote = "Location fit unclear from posting.";
    locationAssessed = false;
  }

  const salary = job.salary_text || "";
  let compensationPts = Math.round(w.compensation * 0.5);
  let compensationNote = "Salary undisclosed — not treated as a reject.";
  let compensationAssessed = false;
  if (salary.trim()) {
    compensationAssessed = true;
    compensationPts = Math.round(w.compensation * 0.7);
    compensationNote = `Posted compensation: ${salary.slice(0, 80)} (preference min not used unless you set one).`;
    if (prefs?.min_monthly_inr) {
      const nums = salary.replace(/,/g, "").match(/\d{2,7}/g)?.map(Number) || [];
      const monthlyGuess = nums.find((n) => n >= 10000 && n <= 500000);
      if (monthlyGuess && monthlyGuess < prefs.min_monthly_inr) {
        compensationPts = Math.round(w.compensation * 0.2);
        compensationNote = `Posted figure looks below your minimum ₹${prefs.min_monthly_inr}/mo.`;
        concerns.push("Compensation may be below your minimum.");
      } else {
        compensationPts = w.compensation;
      }
    }
  }

  const industryHits = hasAny(text, ["saas", "software", "agency", "automation", "ai", "b2b", "startup", "crm", "healthcare", "fintech"]);
  const excluded = (prefs?.excluded_companies || []).some((c) => c && job.company.toLowerCase().includes(c.toLowerCase()));
  let industryPts = Math.round(w.industry * (industryHits.length ? 0.8 : 0.5));
  let industryNote = industryHits.length ? `Industry signals: ${industryHits.slice(0, 4).join(", ")}.` : "Industry not clearly classified.";
  if (excluded) {
    industryPts = 0;
    industryNote = "Company is on your exclude list.";
    concerns.push("Excluded company.");
  }

  const breakdown = {
    skills: { points: skillsPts, max: w.skills, note: skillHits.length ? `Matched: ${skillHits.slice(0, 6).join(", ")}` : "Few overlapping skill terms.", assessed: jobSkillMentions.length > 0 },
    projects: { points: projectsPts, max: w.projects, note: projHits.length ? `Project overlap: ${projHits.join(", ")}` : "Limited project-term overlap.", assessed: true },
    seniority: { points: seniorityPts, max: w.seniority, note: seniorityNote, assessed: seniorityAssessed },
    location: { points: locationPts, max: w.location, note: locationNote, assessed: locationAssessed },
    compensation: { points: compensationPts, max: w.compensation, note: compensationNote, assessed: compensationAssessed },
    industry: { points: industryPts, max: w.industry, note: industryNote, assessed: industryHits.length > 0 },
  };
  const score = Object.values(breakdown).reduce((s, b) => s + b.points, 0);
  const reasons = [
    breakdown.skills.note,
    breakdown.projects.note,
    breakdown.location.note,
    concerns.length ? `Concerns: ${concerns.join(" ")}` : "",
  ].filter(Boolean).join(" ");

  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown,
    matching: [...new Set(matching)],
    missing: [...new Set(missing)],
    reasons: reasons.slice(0, 800),
    concerns: concerns.join(" ").slice(0, 400),
  };
}

export function shouldAutoReject(job: JobForScore, prefs?: { exclude_keywords?: string[]; excluded_companies?: string[] }): string | null {
  const text = blob(job);
  for (const k of prefs?.exclude_keywords || []) {
    if (k && text.includes(k.toLowerCase())) return `exclude keyword: ${k}`;
  }
  for (const c of prefs?.excluded_companies || []) {
    if (c && job.company.toLowerCase().includes(c.toLowerCase())) return `excluded company: ${c}`;
  }
  if (/\bunpaid\b|\bno pay\b|commission only/.test(text) && /intern/.test(text)) return "unpaid/internship";
  return null;
}
