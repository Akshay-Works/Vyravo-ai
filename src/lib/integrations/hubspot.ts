// HubSpot CRM integration (server-side only).
// Requires: HUBSPOT_ACCESS_TOKEN (Vercel env var — never exposed to the client).

const HUBSPOT_API = "https://api.hubapi.com";

export interface LeadSyncData {
  fullName?: string | null;
  email: string;
  phone?: string | null;
  businessName?: string | null;
  businessWebsite?: string | null;
  industry?: string | null;
  companySize?: string | null;
  country?: string | null;
  biggestChallenge?: string | null;
  automationGoals?: string | null;
  budgetRange?: string | null;
  timeline?: string | null;
  leadScore?: number | null;
  leadCategory?: string | null;
  source?: string | null;
  qualificationSummary?: string | null;
}

export interface HubSpotSyncResult {
  configured: boolean;
  ok: boolean;
  action?: "created" | "updated";
  contactId?: string;
  dealId?: string;
  error?: string;
}

export function isHubSpotConfigured(): boolean {
  return Boolean(process.env.HUBSPOT_ACCESS_TOKEN?.trim());
}

function getToken(): string {
  const token = process.env.HUBSPOT_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN is not configured");
  return token;
}

async function hsRequest(path: string, method: string, body?: unknown): Promise<any> {
  const res = await fetch(`${HUBSPOT_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HubSpot ${method} ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---------------------------------------------------------------------------
// Custom properties — best-effort. If the token lacks property-management
// permissions we fall back to standard properties only.
// ---------------------------------------------------------------------------

const CUSTOM_PROPERTIES: { name: string; label: string; type: string; fieldType: string }[] = [
  { name: "vyravo_company_size", label: "Vyravo Company Size", type: "string", fieldType: "text" },
  { name: "vyravo_budget_range", label: "Vyravo Budget Range", type: "string", fieldType: "text" },
  { name: "vyravo_timeline", label: "Vyravo Timeline", type: "string", fieldType: "text" },
  { name: "vyravo_lead_score", label: "Vyravo Lead Score", type: "number", fieldType: "number" },
  { name: "vyravo_lead_category", label: "Vyravo Lead Category", type: "string", fieldType: "text" },
  { name: "vyravo_challenges", label: "Vyravo Biggest Challenge", type: "string", fieldType: "textarea" },
  { name: "vyravo_goals", label: "Vyravo Automation Goals", type: "string", fieldType: "textarea" },
  { name: "vyravo_source", label: "Vyravo Lead Source", type: "string", fieldType: "text" },
];

let customPropsState: "unknown" | "available" | "unavailable" = "unknown";

async function ensureCustomProperties(): Promise<boolean> {
  if (customPropsState !== "unknown") return customPropsState === "available";
  try {
    for (const prop of CUSTOM_PROPERTIES) {
      try {
        await hsRequest("/crm/v3/properties/contacts", "POST", {
          ...prop,
          groupName: "contactinformation",
        });
      } catch (e: any) {
        const msg = String(e?.message || "");
        // 409 = already exists, 400 label/property conflict = effectively exists.
        if (!msg.includes("(409)") && !msg.includes("NON_UNIQUE") && !msg.includes("PropertyValidationError")) throw e;
      }
    }
    customPropsState = "available";
  } catch {
    customPropsState = "unavailable";
  }
  return customPropsState === "available";
}

function sanitizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const cleaned = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) ? cleaned : null;
}

function splitName(fullName?: string | null): { firstName?: string; lastName?: string } {
  const name = (fullName || "").trim();
  if (!name) return {};
  const parts = name.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export async function findContactByEmail(email: string): Promise<{ id: string; properties: Record<string, string> } | null> {
  const result = await hsRequest("/crm/v3/objects/contacts/search", "POST", {
    filterGroups: [{ filters: [{ propertyName: "email", value: email, operator: "EQ" }] }],
    limit: 1,
  });
  const contact = result?.results?.[0];
  return contact ? { id: contact.id, properties: contact.properties || {} } : null;
}

function buildContactProperties(lead: LeadSyncData, includeCustom: boolean): Record<string, string> {
  const { firstName, lastName } = splitName(lead.fullName);
  const props: Record<string, string> = {};
  if (firstName) props.firstname = firstName;
  if (lastName) props.lastname = lastName;
  props.email = lead.email;
  if (lead.phone) props.phone = lead.phone;
  if (lead.businessName) props.company = lead.businessName;
  if (lead.businessWebsite) props.website = lead.businessWebsite;
  if (lead.country) props.country = lead.country;
  if (lead.industry) props.industry = lead.industry;

  if (includeCustom) {
    if (lead.companySize) props.vyravo_company_size = lead.companySize;
    if (lead.budgetRange) props.vyravo_budget_range = lead.budgetRange;
    if (lead.timeline) props.vyravo_timeline = lead.timeline;
    if (lead.leadScore != null) props.vyravo_lead_score = String(lead.leadScore);
    if (lead.leadCategory) props.vyravo_lead_category = lead.leadCategory;
    if (lead.biggestChallenge) props.vyravo_challenges = lead.biggestChallenge;
    if (lead.automationGoals) props.vyravo_goals = lead.automationGoals;
    if (lead.source) props.vyravo_source = lead.source;
  }
  return props;
}

// ---------------------------------------------------------------------------
// Deal pipeline — resolve stage IDs by label from the account's default
// pipeline (Prospecting / Qualification / Proposal Sent / Negotiation /
// Closed Won / Closed Lost), cached in memory.
// ---------------------------------------------------------------------------

const stageCache = new Map<string, string>();
let pipelineCache: { id: string; loaded: boolean } = { id: "", loaded: false };

async function getDefaultPipelineId(): Promise<string> {
  if (pipelineCache.loaded) return pipelineCache.id;
  const data = await hsRequest("/crm/v3/pipelines/deals", "GET");
  const pipelines: any[] = data?.results || [];
  const pipeline = pipelines.find((p) => p.default) || pipelines[0];
  pipelineCache = { id: pipeline?.id || "", loaded: true };
  return pipelineCache.id;
}

/** Returns the HubSpot dealstage id for a label, or null if it doesn't exist. */
export async function resolveDealStageId(label: string): Promise<string | null> {
  const key = label.trim().toLowerCase();
  if (stageCache.has(key)) return stageCache.get(key)!;
  const pipelineId = await getDefaultPipelineId();
  if (!pipelineId) return null;
  const data = await hsRequest(`/crm/v3/pipelines/deals/${pipelineId}/stages`, "GET");
  for (const stage of data?.results || []) {
    stageCache.set(String(stage.label).trim().toLowerCase(), stage.id);
  }
  return stageCache.get(key) || null;
}

/** First matching stage label wins — used when the ideal stage may not exist. */
export async function resolveFirstExistingStage(labels: string[]): Promise<string | null> {
  for (const label of labels) {
    const id = await resolveDealStageId(label);
    if (id) return id;
  }
  return null;
}

async function findDealForContact(contactId: string): Promise<string | null> {
  const data = await hsRequest(`/crm/v4/objects/contacts/${contactId}/associations/deals`, "GET");
  const first = data?.results?.[0];
  return first?.id || null;
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/**
 * Create-or-update a HubSpot contact (deduped by email) and ensure an
 * associated deal exists at the given stage label.
 */
export async function syncLeadToHubSpot(
  lead: LeadSyncData,
  opts: { dealStageLabel?: string; dealName?: string } = {}
): Promise<HubSpotSyncResult> {
  if (!isHubSpotConfigured()) {
    return { configured: false, ok: false, error: "HUBSPOT_ACCESS_TOKEN not configured" };
  }
  const email = sanitizeEmail(lead.email);
  if (!email) return { configured: true, ok: false, error: "Invalid email address" };

  try {
    const includeCustom = await ensureCustomProperties();
    const props = buildContactProperties({ ...lead, email }, includeCustom);

    // Deduplicate: search by email before creating.
    const existing = await findContactByEmail(email);
    let contactId: string;
    let action: "created" | "updated";

    if (existing) {
      await hsRequest(`/crm/v3/objects/contacts/${existing.id}`, "PATCH", { properties: props });
      contactId = existing.id;
      action = "updated";
    } else {
      const created = await hsRequest("/crm/v3/objects/contacts", "POST", { properties: props });
      contactId = created.id;
      action = "created";
    }

    const result: HubSpotSyncResult = { configured: true, ok: true, action, contactId };

    // Deal handling (best-effort — a contact sync is still a success without it).
    try {
      const stageId = opts.dealStageLabel ? await resolveDealStageId(opts.dealStageLabel) : null;
      const dealName = opts.dealName || `${lead.businessName || lead.fullName || email} — AI Automation`;
      const existingDealId = await findDealForContact(contactId);

      if (existingDealId) {
        const patch: Record<string, string> = {};
        if (stageId) patch.dealstage = stageId;
        if (Object.keys(patch).length > 0) {
          await hsRequest(`/crm/v3/objects/deals/${existingDealId}`, "PATCH", { properties: patch });
        }
        result.dealId = existingDealId;
      } else {
        const pipelineId = await getDefaultPipelineId();
        const dealProps: Record<string, string> = { dealname: dealName };
        if (pipelineId) dealProps.pipeline = pipelineId;
        if (stageId) dealProps.dealstage = stageId;
        if (lead.qualificationSummary) dealProps.description = lead.qualificationSummary;
        const deal = await hsRequest("/crm/v3/objects/deals", "POST", {
          properties: dealProps,
          associations: [
            {
              to: { id: contactId },
              types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }],
            },
          ],
        });
        result.dealId = deal?.id;
      }
    } catch (dealError) {
      console.error("HubSpot deal sync failed (contact was synced):", dealError);
    }

    return result;
  } catch (error) {
    console.error("HubSpot contact sync failed:", error);
    return { configured: true, ok: false, error: String(error instanceof Error ? error.message : error) };
  }
}

/**
 * Move the deal associated with a contact's email to a new stage.
 * Tries each candidate label in order and uses the first stage that exists.
 */
export async function updateDealStageForEmail(
  email: string,
  candidateLabels: string[]
): Promise<{ ok: boolean; moved?: boolean; error?: string }> {
  if (!isHubSpotConfigured()) {
    return { ok: false, error: "HUBSPOT_ACCESS_TOKEN not configured" };
  }
  const cleanEmail = sanitizeEmail(email);
  if (!cleanEmail) return { ok: false, error: "Invalid email address" };

  try {
    const contact = await findContactByEmail(cleanEmail);
    if (!contact) return { ok: false, error: "Contact not found in HubSpot" };

    const dealId = await findDealForContact(contact.id);
    if (!dealId) return { ok: false, moved: false, error: "No associated deal found" };

    const stageId = await resolveFirstExistingStage(candidateLabels);
    if (!stageId) return { ok: false, moved: false, error: "No matching pipeline stage exists" };

    await hsRequest(`/crm/v3/objects/deals/${dealId}`, "PATCH", { properties: { dealstage: stageId } });
    return { ok: true, moved: true };
  } catch (error) {
    console.error("HubSpot deal stage update failed:", error);
    return { ok: false, error: String(error instanceof Error ? error.message : error) };
  }
}
