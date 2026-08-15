import { db } from "@/db";
import { contactSubmissions } from "@/db/schema";
import { syncLeadToHubSpot, isHubSpotConfigured } from "@/lib/integrations/hubspot";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, phone, company, service, message } = body;

    if (!name || !email || !message) {
      return Response.json(
        { error: "Name, email, and message are required." },
        { status: 400 }
      );
    }

    // Basic sanitization for a public endpoint.
    const cleanEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    const cleanName = String(name).trim().slice(0, 200);
    const cleanMessage = String(message).trim().slice(0, 5000);

    await db.insert(contactSubmissions).values({
      name: cleanName,
      email: cleanEmail,
      phone: phone ? String(phone).slice(0, 40) : null,
      company: company ? String(company).slice(0, 200) : null,
      service: service ? String(service).slice(0, 100) : null,
      message: cleanMessage,
    });

    // HubSpot: create/update the contact (deduped by email) + a Prospecting
    // deal so the inquiry lands in the pipeline. Best-effort — the contact
    // form keeps working even if HubSpot is unconfigured or unreachable.
    let hubspot: { configured: boolean; ok: boolean; detail?: string } = {
      configured: isHubSpotConfigured(),
      ok: false,
    };
    if (hubspot.configured) {
      const result = await syncLeadToHubSpot(
        {
          fullName: cleanName,
          email: cleanEmail,
          phone: phone ? String(phone).slice(0, 40) : null,
          businessName: company ? String(company).slice(0, 200) : null,
          source: "contact-form",
          qualificationSummary: cleanMessage,
          biggestChallenge: service ? `Interested in: ${String(service).slice(0, 100)}` : null,
        },
        { dealStageLabel: "Prospecting" }
      );
      hubspot = { configured: true, ok: result.ok, detail: result.error };
    } else {
      hubspot.detail = "HUBSPOT_ACCESS_TOKEN not configured";
    }

    return Response.json({
      success: true,
      message: "Thank you! We'll be in touch shortly.",
      hubspot,
    });
  } catch {
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
