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
  { key: "services", label: "Recommended services", sample: "lead follow-up automation, enquiry response" },
  { key: "automation_goals", label: "Automation goals", sample: "faster follow-ups, no missed enquiries" },
  { key: "current_software", label: "Current software", sample: "WhatsApp + Excel" },
  { key: "monthly_leads", label: "Monthly leads", sample: "120" },
  { key: "meetingDate", label: "Meeting date & time", sample: "2 Sep 2026, 11:00 AM" },
  { key: "meetingTime", label: "Meeting time", sample: "11:00 AM IST" },
  { key: "meetingLink", label: "Meeting link", sample: "meet.google.com/abc-defg-hij" },
  { key: "date", label: "Today's date", sample: "31 Aug 2026" },
  { key: "greeting", label: "Greeting (“Hi Rahul,” / “Hello,”)", sample: "Hi Rahul," },
  { key: "provable", label: "Proof line (evidence-based)", sample: "your site has no live chat, so after-hours enquiries can sit until morning." },
  { key: "cityCountry", label: "Location (“ in Singapore”)", sample: " in Singapore" },
  { key: "industry_phrase", label: "Industry phrase", sample: "similar real estate businesses" },
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

const INDUSTRY_LABELS: Record<string, string> = {
  estate_agent: "real estate",
  real_estate: "real estate",
  realtor: "real estate",
  broker: "real estate",
  property_management: "property management",
  travel_agency: "travel & tourism",
  employment_agency: "recruitment",
};

function prettifyIndustry(v?: string | null): string {
  if (!v) return "";
  const s = v.trim().toLowerCase();
  if (INDUSTRY_LABELS[s]) return INDUSTRY_LABELS[s];
  return s.replace(/_/g, " ");
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

function fmtMeeting(v: unknown): string {
  if (!v) return "";
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function fmtMeetingTime(v: unknown, tz?: string | null): string {
  if (!v) return "";
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return "";
  const t = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  return tz ? `${t} ${tz}` : t;
}

/** Map a DB lead row (snake_case or camelCase) → template variables.
 *  Never fabricates: missing = "". */
export function leadToTemplateData(lead: Record<string, any>): Record<string, string> {
  const full = lead.fullName || lead.full_name || lead.businessName || lead.business_name || "";
  const firstName = full.trim().split(/\s+/)[0] || lead.businessName || lead.business_name || "";
  const score = lead.leadScore ?? lead.lead_score;
  return {
    firstName,
    fullName: full,
    company: lead.businessName || lead.business_name || lead.fullName || lead.full_name || "",
    website: (lead.businessWebsite || lead.business_website || "").replace(/^https?:\/\//, ""),
    phone: lead.phone || "",
    email: lead.email || "",
    services: (Array.isArray(lead.recommendedServices) || Array.isArray(lead.recommended_services)
      ? (lead.recommendedServices || lead.recommended_services).join(", ")
      : (lead.recommendedServices || lead.recommended_services || "")),
    automation_goals: lead.automationGoals || lead.automation_goals || "",
    current_software: lead.currentSoftware || lead.current_software || "",
    monthly_leads: lead.monthlyLeads || lead.monthly_leads || "",
    city: lead.city || "",
    country: lead.country || "",
    industry: prettifyIndustry(lead.industry),
    score: score != null ? String(score) : "",
    category: (lead.leadCategory || lead.lead_category || "").toUpperCase(),
    challenge: lead.biggestChallenge || lead.biggest_challenge || lead.qualificationSummary || lead.qualification_summary || "",
    summary: lead.qualificationSummary || lead.qualification_summary || lead.additionalInfo || lead.additional_info || "",
    date: fmtDate(new Date()),
    year: String(new Date().getFullYear()),
    meetingDate: fmtMeeting(lead.meeting_date || lead.meetingDate),
    meetingTime: fmtMeetingTime(lead.meeting_date || lead.meetingDate, lead.meeting_timezone || lead.meetingTimezone),
    meetingLink: lead.meeting_link || lead.meetingLink || "",
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
    meetingDate: "2 Sep 2026, 11:00 AM",
    meetingTime: "11:00 AM IST",
    meetingLink: "meet.google.com/abc-defg-hij",
  };
}
