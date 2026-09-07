// ============================================================================
// LEAD DATA QUALITY RULE — mandatory contact gate + contactability ranking.
//   RULE: a lead MUST have at least one of (valid email | valid phone).
//   Website & LinkedIn are enrichment only — NEVER qualification fields.
//   Reject: no email AND no phone. Never fabricate contacts.
//   PRIORITY: P1 phone+email+website+linkedin · P2 phone+email+optional(s)
//             P3 email+optional · P4 phone+optional · 0 = REJECT
// Defense-in-depth: enforced at both ingest endpoints (engine + foreign).
// ============================================================================
import { pool } from "@/db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function qualityValidEmail(v: unknown): boolean {
  if (typeof v !== "string" || !v.trim()) return false;
  return EMAIL_RE.test(v.trim());
}

/** Phone must be plausible: 8–15 digits after stripping separators/plus. */
export function qualityValidPhone(v: unknown): boolean {
  if (typeof v !== "string" || !v.trim()) return false;
  const digits = v.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

export function qualityHasWebsite(v: unknown): boolean {
  return typeof v === "string" && /^https?:\/\/|^[\w-]+(\.[\w-]+)+/i.test(v.trim());
}

export function qualityHasLinkedin(v: unknown): boolean {
  return typeof v === "string" && /linkedin\.com\/(in|company|pub)\//i.test(v.trim());
}

/**
 * Contactability priority (0 = REJECT — no valid email AND no valid phone).
 * Accepts either naming convention (drizzle row or raw API body).
 */
export function contactPriorityOf(f: {
  email?: unknown;
  phone?: unknown;
  website?: unknown;
  linkedin?: unknown;
}): number {
  const hasEmail = qualityValidEmail(f.email);
  const hasPhone = qualityValidPhone(f.phone);
  const hasSite = qualityHasWebsite(f.website);
  const hasLi = qualityHasLinkedin(f.linkedin);
  if (hasEmail && hasPhone) return hasSite && hasLi ? 1 : 2;
  if (hasEmail) return 3;
  if (hasPhone) return 4;
  return 0;
}

let _ensured = false;
/** Idempotent: adds contact_priority if missing (backward compatible). */
export async function ensureContactPriorityColumn(): Promise<void> {
  if (_ensured) return;
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_priority integer`);
  _ensured = true;
}
