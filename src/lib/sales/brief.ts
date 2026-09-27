// ============================================================================
// SALES OS — discovery brief (§13). Assembled ONLY from real CRM data
// (lead + research + threads + qualification). No LLM, no invention —
// unknowns are marked Unknown.
// ============================================================================
import { pool } from "@/db";
import { extractBuyingSignals } from "./qualify";

export async function buildDiscoveryBrief(leadId: number): Promise<string> {
  const lead = (await pool.query(`SELECT * FROM leads WHERE id = $1`, [leadId])).rows[0];
  if (!lead) return "Lead not found.";
  const inbox = await pool.query(
    `SELECT direction, from_email, subject, body_text, classification, created_at
     FROM inbox_messages WHERE lead_id = $1 ORDER BY id DESC LIMIT 8`, [leadId]);
  const out = await pool.query(
    `SELECT subject, follow_up_number, status, sent_at FROM outreach_events
     WHERE lead_id = $1 ORDER BY follow_up_number LIMIT 5`, [leadId]);
  const threadText = inbox.rows.filter((m: any) => m.direction === "in")
    .map((m: any) => m.body_text || "").join("\n");
  const sig = extractBuyingSignals(threadText);
  const sig2 = lead.signals && typeof lead.signals === "object" ? lead.signals : null;
  const L: string[] = [];
  const sec = (k: string, v: any) => L.push(`${k}: ${v && String(v).trim() ? String(v).trim().slice(0, 600) : "Unknown"}`);
  L.push(`DISCOVERY BRIEF — generated ${new Date().toISOString().slice(0, 16)}Z`, "");
  sec("Company", lead.business_name);
  sec("Contact", `${lead.full_name || ""} <${lead.email || ""}> ${lead.phone ? "| " + lead.phone : ""}`);
  sec("Role", lead.additional_info && /owner|founder|ceo|director/i.test(lead.additional_info) ? "Likely decision-maker (from notes)" : "Unknown");
  L.push("");
  sec("Company summary", `${lead.industry || "Unknown industry"}${lead.city || lead.country ? ` — ${[lead.city, lead.country].filter(Boolean).join(", ")}` : ""}${lead.business_website ? ` — ${lead.business_website}` : ""}${sig2?.description ? `. Web: ${sig2.description}` : ""}`);
  sec("Likely pain points", lead.biggest_challenge || (threadText ? "See conversation history" : null));
  L.push("", "Conversation history:");
  if (!inbox.rows.length && !out.rows.length) L.push("- No outreach or replies recorded.");
  for (const o of [...out.rows].reverse())
    L.push(`- OUT ${o.status} (FU${o.follow_up_number}): ${String(o.subject || "").slice(0, 90)}`);
  for (const m of [...inbox.rows].reverse())
    L.push(`- ${m.direction === "out" ? "OUT (AI reply)" : `IN (${m.classification || "?"})`}: ${String(m.body_text || "").slice(0, 220)}`);
  L.push("");
  sec("What they told us", [sig.budget && `budget ${sig.budget}`, sig.timeline && `timeline ${sig.timeline}`, `authority: ${sig.authority}`, `intent ${sig.intent}/3`].filter(Boolean).join("; "));
  sec("Likely requirements", lead.automation_goals || lead.desired_outcome || null);
  sec("Potential Vyravo solution", lead.recommended_services || "To scope on the call from pain points above");
  L.push("", "Questions to ask:",
    "- What happens today when an enquiry arrives after hours?",
    "- Which follow-ups currently depend on someone remembering?",
    "- What would a missed enquiry be worth to you in a month?",
    "- Who else weighs in on a decision like this?");
  L.push("", "Potential objections: price sensitivity (SMB), 'we manage manually', timing.");
  sec("Suggested pricing direction", lead.budget_range ? `They hinted ${lead.budget_range} — anchor scope to it, do not discount unilaterally` : "Scope first, price after (see approved proposal flow)");
  sec("Desired outcome", "Confirm problem + authority + timeline; agree proposal next step");
  return L.join("\n").slice(0, 6000);
}
