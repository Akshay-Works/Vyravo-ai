import { pool } from "@/db";
import { getCareerProfile } from "./profile";

export function tailorResume(master: string, job: { title: string; company: string; description: string }): string {
  const desc = (job.description || "").toLowerCase();
  const boost: string[] = [];
  if (/hubspot|crm/.test(desc)) boost.push("Emphasize: HubSpot CRM lifecycle, pipeline stages, qualification and routing.");
  if (/automat/.test(desc)) boost.push("Emphasize: end-to-end workflow automation (intake → CRM → email → reporting).");
  if (/implement|onboard/.test(desc)) boost.push("Emphasize: discovery, scoping, deployment on GitHub/Vercel, handover docs.");
  if (/chatbot|knowledge/.test(desc)) boost.push("Emphasize: production knowledge-base chatbot on vyravo-ai.vercel.app.");
  if (/revops|revenue|sales ops/.test(desc)) boost.push("Emphasize: sales-ops command centre, follow-up sequences, reply tracking.");
  const header = [
    `TAILORED FOR: ${job.title} at ${job.company}`,
    "Only verified facts from the approved master resume. Nothing invented.",
    ...boost,
    "",
  ].join("\n");
  return `${header}${master}`.slice(0, 20000);
}

export function coverLetter(profile: any, job: { title: string; company: string; location: string }): string {
  const name = profile.full_name || "Akshay Navale";
  return `Dear Hiring Team,

I am applying for the ${job.title} role at ${job.company}${job.location ? ` (${job.location})` : ""}.

I founded Vyravo AI, an AI automation practice based in Pune, where I design, build and operate the systems businesses use to capture leads, run CRM pipelines and automate follow-up. That includes a live knowledge-base chatbot, HubSpot lifecycle automation, a four-step discovery-call funnel (intake → recommendations → Calendly → email), and a lead-generation pipeline on public map data with validation and deduplication.

I also operate BrandNest Studio as a separate creative-services line, so I am used to keeping client work, records and workflows cleanly separated.

I hold a BSc in Computer Science (2021–2024, Pune) and completed professional certificates in DevOps/cloud (IBM, AWS, Google Cloud, Cisco) in 2024–2025. I am based in Pune and open to remote or hybrid roles that hire in India.

I would welcome the chance to walk through a live system rather than slides. Thank you for your time.

Sincerely,
${name}
${profile.phone || ""}
${profile.email || ""}
`.trim();
}

export function recruiterMessage(job: { title: string; company: string }): string {
  return `Hi — I'm Akshay, founder of Vyravo AI in Pune. I build AI chatbots, HubSpot CRM workflows and lead-ops systems (live at vyravo-ai.vercel.app). I'm interested in the ${job.title} role at ${job.company} and can share a short walkthrough of a production workflow if useful.`;
}

export function followUpMessage(job: { title: string; company: string }): string {
  return `Hi — following up on my application for ${job.title} at ${job.company}. Happy to share a 10-minute walkthrough of the production chatbot / CRM workflow I run at Vyravo AI. Thank you.`;
}

export async function generateDocsForJob(jobId: number, applicationId?: number | null): Promise<{ n: number }> {
  const job = (await pool.query(`SELECT * FROM career_jobs WHERE id = $1`, [jobId])).rows[0];
  if (!job) throw new Error("job not found");
  const profile = await getCareerProfile();
  const kinds: { kind: string; body: string }[] = [
    { kind: "resume", body: tailorResume(profile.master_resume || "", job) },
    { kind: "cover_letter", body: coverLetter(profile, job) },
    { kind: "recruiter_msg", body: recruiterMessage(job) },
    { kind: "followup", body: followUpMessage(job) },
  ];
  let n = 0;
  for (const k of kinds) {
    const ver = (await pool.query(
      `SELECT coalesce(max(version),0)::int v FROM career_documents WHERE job_id=$1 AND kind=$2`,
      [jobId, k.kind])).rows[0].v + 1;
    await pool.query(
      `INSERT INTO career_documents (job_id, application_id, kind, body, version) VALUES ($1,$2,$3,$4,$5)`,
      [jobId, applicationId || null, k.kind, k.body, ver]);
    n++;
  }
  await pool.query(`UPDATE career_jobs SET status = CASE WHEN status IN ('discovered','under_review','shortlisted') THEN 'documents_generated' ELSE status END WHERE id=$1`, [jobId]);
  return { n };
}
