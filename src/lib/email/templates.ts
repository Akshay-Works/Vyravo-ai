// ============================================================
// Email template rendering — {{variable}} personalization.
// Shared by the admin templates page (preview) and the queue
// API (server-side render before enqueueing).
// ============================================================

export const TEMPLATE_VARS: { key: string; label: string; sample: string }[] = [
  { key: "firstName", label: "First name", sample: "Rahul" },
  { key: "fullName", label: "Full name", sample: "D.S. Kulkarni Developers Ltd." },
  { key: "company", label: "Company", sample: "SRK Dreamz Real Estate" },
  { key: "website", label: "Website", sample: "srkdreamz.com" },
  { key: "phone", label: "Phone", sample: "+91 98200 17526" },
  { key: "email", label: "Email", sample: "info@srkdreamz.com" },
  { key: "city", label: "City", sample: "Pune" },
  { key: "country", label: "Country", sample: "India" },
  { key: "industry", label: "Industry", sample: "real estate" },
  { key: "score", label: "Lead score", sample: "78" },
  { key: "category", label: "Category", sample: "HIGH PRIORITY" },
  { key: "challenge", label: "Biggest challenge", sample: "leads come in but 70% never get a follow-up call" },
  { key: "summary", label: "AI summary", sample: "Scored 78/100 — strong fit for AI lead automation." },
  { key: "date", label: "Today's date", sample: "31 Aug 2026" },
  { key: "year", label: "Year", sample: "2026" },
];

export const TEMPLATE_VAR_KEYS = new Set(TEMPLATE_VARS.map((v) => v.key));

export function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Replace {{var}} tokens. HTML body → escaped values; subject → raw text. */
export function renderTemplate(text: string, data: Record<string, unknown>, { html = false } = {}): string {
  return String(text).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    let v = data[key];
    if (v === null || v === undefined) v = "";
    const s = String(v);
    return html ? escapeHtml(s) : s;
  });
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** Map a DB lead row → template variables. Never fabricates: missing = "". */
export function leadToTemplateData(lead: Record<string, any>): Record<string, string> {
  const full = lead.fullName || lead.businessName || "";
  const firstName = full.trim().split(/\s+/)[0] || lead.businessName || "";
  return {
    firstName,
    fullName: full,
    company: lead.businessName || lead.fullName || "",
    website: (lead.businessWebsite || "").replace(/^https?:\/\//, ""),
    phone: lead.phone || "",
    email: lead.email || "",
    city: lead.city || "",
    country: lead.country || "",
    industry: lead.industry || "",
    score: lead.leadScore != null ? String(lead.leadScore) : "",
    category: (lead.leadCategory || "").toUpperCase(),
    challenge: lead.biggestChallenge || lead.qualificationSummary || "",
    summary: lead.qualificationSummary || lead.additionalInfo || "",
    date: fmtDate(new Date()),
    year: String(new Date().getFullYear()),
  };
}

/** Sample data used for the live preview in the admin (not sent anywhere). */
export function sampleTemplateData(): Record<string, string> {
  return {
    firstName: "Rahul",
    fullName: "D.S. Kulkarni Developers Ltd.",
    company: "D.S. Kulkarni Developers Ltd.",
    website: "dskdevelopers.com",
    phone: "+91 98200 17526",
    email: "info@dskdevelopers.com",
    city: "Pune",
    country: "India",
    industry: "real estate",
    score: "78",
    category: "HIGH PRIORITY",
    challenge: "leads come in daily but 70% never get a follow-up",
    summary: "Scored 78/100 — strong fit for AI lead automation and follow-up.",
    date: fmtDate(new Date()),
    year: String(new Date().getFullYear()),
  };
}
