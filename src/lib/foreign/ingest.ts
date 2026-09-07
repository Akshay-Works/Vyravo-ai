// ============================================================
// FOREIGN ENGINE — ingest validation + merge (defense in depth).
// The engine already dedupes; this layer re-checks and MERGES so a
// duplicate can never be created from any caller. Every field is
// type-checked, length-capped and whitelisted before touching the DB.
// ============================================================
import { pool } from "@/db";
import { ensureForeignSchema, FOREIGN_LEAD_TYPES, foreignBucket } from "./schema";
import { qualityHasWebsite, qualityHasLinkedin } from "@/lib/leads/quality";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LI_RE = /^(https?:\/\/)?([\w-]+\.)?linkedin\.com\/(in|company|pub)\/[A-Za-z0-9\-_%]+/i;
const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : null;
};

export type ForeignLeadIn = {
  lead_type: string;
  company_name: string;
  website?: string | null;
  country_code?: string | null;
  country_name?: string | null;
  city?: string | null;
  area?: string | null;
  industry?: string | null;
  industry_label?: string | null;
  company_size?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  email?: string | null;
  email_status?: string | null;
  email_source?: string | null;
  email_verified_at?: string | null;
  score?: number | null;
  bucket?: string | null;
  stage?: string | null;
  why_this_lead?: string | null;
  recommended_offer?: string | null;
  outreach_drafts?: Record<string, unknown> | null;
  agency_services?: string[] | null;
  agency_type?: string | null;
  white_label_fit?: string | null;
  partnership_angle?: string | null;
  signals?: Record<string, unknown> | null;
  website_ok?: boolean | null;
  source?: string | null;
  contact_priority?: number | null;
  job_title?: string | null;
  decision_maker_name?: string | null;
  found_at?: string | null;
  score_reasons?: string[] | null;
};

const OK_STATUSES = new Set(["VERIFIED", "LIKELY", "UNKNOWN", "INVALID", null, undefined]);
const OK_STAGES = new Set(["NEW", "RESEARCHED", "QUALIFIED", "READY_FOR_OUTREACH", "CONTACTED", "REPLIED", "CALL_BOOKED", "PROPOSAL", "WON", "LOST", "WHITE_LABEL_PROSPECT", "PARTNERSHIP_CONTACTED", "INTERESTED", "PARTNERSHIP_CALL", "ACTIVE_PARTNER"]);

export function validateForeignLead(raw: any): { ok: true; lead: ForeignLeadIn } | { ok: false; error: string } {
  const lead_type = str(raw?.lead_type, 30);
  if (!lead_type || !FOREIGN_LEAD_TYPES.includes(lead_type as any)) return { ok: false, error: "invalid lead_type" };
  const company_name = str(raw?.company_name, 90);
  if (!company_name || company_name.length < 3) return { ok: false, error: "company_name required (3+ chars)" };
  const email = str(raw?.email, 120)?.toLowerCase() || null;
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: "invalid email" };
  const email_status = (raw?.email_status ?? null) as string | null;
  if (!OK_STATUSES.has(email_status)) return { ok: false, error: "invalid email_status" };
  const score = num(raw?.score, 0, 100);
  const website = str(raw?.website, 300);
  // ---- LEAD DATA QUALITY RULE: email OR phone is MANDATORY ----
  const phone = str(raw?.phone, 40);
  if (!email && !phone) {
    return { ok: false, error: "no valid email AND no valid phone — mandatory contact rule (website/LinkedIn are enrichment, not qualification)" };
  }
  const contact_priority = (() => {
    const hasEmail = !!email, hasPhone = !!phone;
    const hasSite = qualityHasWebsite(website);
    const hasLi = qualityHasLinkedin(raw?.linkedin_url);
    if (hasEmail && hasPhone) return hasSite && hasLi ? 1 : 2;
    if (hasEmail) return 3;
    if (hasPhone) return 4;
    return 0;
  })();
  const linkedin_url = typeof raw?.linkedin_url === "string" && LI_RE.test(raw.linkedin_url.trim()) ? raw.linkedin_url.trim().slice(0, 300) : null;
  const country_code = str(raw?.country_code, 2)?.toLowerCase() || null;
  const country_name = str(raw?.country_name, 80) || (country_code ? country_code.toUpperCase() : null);
  const industry = str(raw?.industry, 40) || null;
  const found_at = str(raw?.found_at, 40) || null;
  const decision_maker_name = str(raw?.decision_maker_name, 80);
  const job_title = str(raw?.job_title, 60);
  const why_this_lead = str(raw?.why_this_lead, 400);
  const recommended_offer = str(raw?.recommended_offer, 200);
  const partnership_angle = str(raw?.partnership_angle, 500);
  const agency_type = str(raw?.agency_type, 80);
  const white_label_fit = str(raw?.white_label_fit, 20);
  const agency_services = Array.isArray(raw?.agency_services)
    ? (raw.agency_services as any[]).map((x) => str(x, 60)).filter((x): x is string => Boolean(x)).slice(0, 12)
    : null;
  const score_reasons = Array.isArray(raw?.score_reasons)
    ? (raw.score_reasons as any[]).map((x) => str(x, 200)).filter((x): x is string => Boolean(x)).slice(0, 30)
    : null;
  const outreach_drafts =
    raw?.outreach_drafts && typeof raw.outreach_drafts === "object" ? raw.outreach_drafts : null;
  const signals = raw?.signals && typeof raw.signals === "object" ? raw.signals : null;
  const bucket = str(raw?.bucket, 10) || foreignBucket(score ?? 0);
  const stageIn = str(raw?.stage, 30);
  const stage = stageIn && OK_STAGES.has(stageIn) ? stageIn : score !== null && score >= 60 ? "QUALIFIED" : "NEW";

  return {
    ok: true,
    lead: {
      lead_type, company_name, website, country_code, country_name, city: str(raw?.city, 80),
      area: str(raw?.area, 80), industry, industry_label: str(raw?.industry_label, 60),
      company_size: str(raw?.company_size, 40), phone, linkedin_url, email, email_status,
      email_source: str(raw?.email_source, 30), email_verified_at: str(raw?.email_verified_at, 40),
      score, bucket, stage, why_this_lead, recommended_offer, outreach_drafts,
      agency_services, agency_type, white_label_fit, partnership_angle, signals,
      website_ok: typeof raw?.website_ok === "boolean" ? raw.website_ok : null,
      source: str(raw?.source, 30) || "foreign_engine",
      contact_priority,
      job_title, decision_maker_name, found_at, score_reasons,
    },
  };
}

// ---------------------------------------------------------------------------
// MERGE — fill-only semantics, never downgrade, never duplicate.
// ---------------------------------------------------------------------------
export async function upsertForeignLead(l: ForeignLeadIn): Promise<{ action: "created" | "merged" | "invalid"; id?: number; reason?: string }> {
  const email = l.email || null;
  const website = l.website || null;
  const domain = website ? website.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].toLowerCase() : null;
  const name = l.company_name.toLowerCase().replace(/\b(pvt|ltd|limited|inc|llc|llp|corp|corporation|co|company|group|gmbh|pty|plc|sa|sarl|bv)\b\.?/gi, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

  let existing: any = null;
  if (email) {
    const r = await pool.query(`SELECT * FROM leads WHERE lower(email) = lower($1) LIMIT 1`, [email]);
    if (r.rows.length) existing = r.rows[0];
  }
  if (!existing && domain) {
    const r = await pool.query(`SELECT * FROM leads WHERE lower(business_website) LIKE $1 LIMIT 1`, [`%${domain}%`]);
    if (r.rows.length) existing = r.rows[0];
  }
  if (!existing && name.length >= 4) {
    const r = await pool.query(`SELECT * FROM leads WHERE lower(regexp_replace(business_name, '\\b(pvt|ltd|limited|inc|llc|llp|corp|corporation|co|company|group|gmbh|pty|plc)\\b\\.?', '', 'gi')) = $1 LIMIT 1`, [name]);
    if (r.rows.length) existing = r.rows[0];
  }
  if (!existing && l.linkedin_url) {
    const r = await pool.query(`SELECT * FROM leads WHERE linkedin_url = $1 LIMIT 1`, [l.linkedin_url]);
    if (r.rows.length) existing = r.rows[0];
  }

  if (existing) {
    // merge: fill blanks, union arrays, keep the better email status
    const rank: Record<string, number> = { VERIFIED: 3, LIKELY: 2, UNKNOWN: 1, INVALID: 0 };
    const oldStatus = existing.email_verification_status || "UNKNOWN";
    const want = email ? rank[l.email_status || "UNKNOWN"] ?? 0 : 0;
    const have = rank[oldStatus] ?? 0;
    const useNewEmail = !!(email && want > have) || (!existing.email && email);
    await pool.query(
      `UPDATE leads SET
         business_name = COALESCE(NULLIF($1,''), business_name),
         business_website = COALESCE(NULLIF($2,''), business_website),
         linkedin_url = COALESCE(NULLIF($3,''), linkedin_url),
         country = COALESCE(NULLIF($4,''), country),
         city = COALESCE(NULLIF($5,''), city),
         industry = COALESCE(NULLIF($6,''), industry),
         company_size = COALESCE(NULLIF($7,''), company_size),
         phone = COALESCE(NULLIF($8,''), phone),
         first_name = COALESCE(NULLIF($9,''), first_name),
         last_name = COALESCE(NULLIF($10,''), last_name),
         job_title = COALESCE(NULLIF($11,''), job_title),
         email = CASE WHEN $12 THEN $13 ELSE email END,
         email_verification_status = CASE WHEN $12 THEN $14 ELSE email_verification_status END,
         email_verification_source = CASE WHEN $12 THEN $15 ELSE email_verification_source END,
         email_verified_at = CASE WHEN $12 THEN $16 ELSE email_verified_at END,
         lead_type = COALESCE(NULLIF($17,''), lead_type),
         lead_score = GREATEST(COALESCE(lead_score,0), $18),
         lead_category = COALESCE(NULLIF($19,''), lead_category),
         why_this_lead = COALESCE(NULLIF($20,''), why_this_lead),
         recommended_offer = COALESCE(NULLIF($21,''), recommended_offer),
         partnership_angle = COALESCE(NULLIF($22,''), partnership_angle),
         agency_services = CASE WHEN $23::jsonb IS NOT NULL THEN COALESCE(agency_services,'[]'::jsonb) || $23::jsonb ELSE agency_services END,
         score_reasons = COALESCE(NULLIF($24,'')::jsonb, score_reasons),
         outreach_drafts = COALESCE($25::jsonb, outreach_drafts),
         website_ok = COALESCE($26, website_ok),
         white_label_fit = COALESCE(NULLIF($27,''), white_label_fit),
         contact_priority = GREATEST(COALESCE(contact_priority, 0), $29),
         last_enriched_at = now(),
         updated_at = now()
       WHERE id = $28`,
      [
        l.company_name, website, l.linkedin_url, l.country_name, l.city, l.industry, l.company_size, l.phone,
        l.decision_maker_name && l.decision_maker_name.split(" ")[0] || null,
        l.decision_maker_name && l.decision_maker_name.split(" ").slice(1).join(" ") || null,
        l.job_title,
        useNewEmail, email || null, l.email_status || null, l.email_source || null, l.email_verified_at || null,
        l.lead_type, l.score ?? 0, l.bucket ?? null,
        l.why_this_lead || null, l.recommended_offer || null, l.partnership_angle || null,
        JSON.stringify(l.agency_services || []), JSON.stringify(l.score_reasons || null),
        JSON.stringify(l.outreach_drafts || null), l.website_ok, l.white_label_fit || null,
        existing.id, l.contact_priority ?? 0,
      ]
    );
    return { action: "merged", id: existing.id };
  }

  const firstName = l.decision_maker_name ? l.decision_maker_name.split(" ")[0] : null;
  const lastName = l.decision_maker_name ? l.decision_maker_name.split(" ").slice(1).join(" ") || null : null;
  const r = await pool.query(
    `INSERT INTO leads
      (full_name, email, phone, business_name, business_website, industry, company_size, country,
       city, first_name, last_name, job_title, linkedin_url,
       lead_score, lead_category, lead_type, recommended_services, qualification_summary,
       stage, status, priority, source, tags,
       email_verification_status, email_verification_source, email_verified_at,
       why_this_lead, recommended_offer, outreach_drafts, score_reasons,
       agency_type, agency_services, white_label_fit, partnership_angle,
       website_ok, contact_priority, last_enriched_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'active','medium',$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,now(),now())
     RETURNING id`,
    [
      l.decision_maker_name || l.company_name, email, l.phone, l.company_name, website, l.industry, l.company_size, l.country_name || l.country_code || "Unknown",
      l.city, firstName, lastName, l.job_title, l.linkedin_url,
      l.score ?? 0, l.bucket ?? null, l.lead_type, l.recommended_offer ? JSON.stringify([l.recommended_offer]) : null, l.why_this_lead,
      l.stage || "NEW", l.source, JSON.stringify(l.agency_services || []),
      l.email_status || "UNKNOWN", l.email_source || null, l.email_verified_at || null,
      l.why_this_lead, l.recommended_offer, JSON.stringify(l.outreach_drafts || null), JSON.stringify(l.score_reasons || null),
      l.agency_type, JSON.stringify(l.agency_services || []), l.white_label_fit, l.partnership_angle,
      l.website_ok, l.contact_priority ?? 0, l.found_at ? new Date(l.found_at) : new Date(),
    ]
  );
  // a lead must be contactable before it enters the email pipeline:
  // outreach discovers by email + lead_score; stage READY_FOR_OUTREACH is
  // informational for foreign leads (pipeline gates still apply).
  return { action: "created", id: r.rows[0].id };
}

export async function ingestForeignBatch(leads: any[]): Promise<{ created: number; merged: number; failed: number; errors: string[] }> {
  await ensureForeignSchema();
  let created = 0, merged = 0, failed = 0;
  const errors: string[] = [];
  for (const raw of leads) {
    const v = validateForeignLead(raw);
    if (!v.ok) { failed++; errors.push(v.error); continue; }
    try {
      const r = await upsertForeignLead(v.lead);
      if (r.action === "created") created++;
      else merged++;
    } catch (e: any) {
      failed++;
      errors.push(String(e?.message || e).slice(0, 120));
    }
  }
  return { created, merged, failed, errors };
}
