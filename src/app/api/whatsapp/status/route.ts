import { getWhatsAppConfigStatus } from "@/lib/whatsapp/meta";

export const dynamic = "force-dynamic";

/** Safe configuration visibility for deployment diagnostics; never returns secrets. */
export async function GET(): Promise<Response> {
  const config = getWhatsAppConfigStatus();
  return Response.json({
    whatsapp: {
      configured: config.configured,
      phoneNumberIdConfigured: config.phoneNumberIdConfigured,
      webhookVerificationConfigured: config.webhookVerificationConfigured,
      signatureVerificationConfigured: config.signatureVerificationConfigured,
      businessAccountIdConfigured: config.businessAccountIdConfigured,
      api: "Meta WhatsApp Cloud API",
    },
    ai: {
      configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
      fallback: "existing Vyravo AI deterministic chatbot engine",
    },
    crm: {
      configured: Boolean(process.env.HUBSPOT_ACCESS_TOKEN?.trim()),
    },
    persistence: {
      configured: Boolean(process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim()),
      mode: process.env.WHATSAPP_STORE === "memory" ? "memory" : "database",
    },
    handoff: {
      notificationWorkflowConfigured: Boolean(process.env.EMAIL_AUTOMATION_WEBHOOK_URL?.trim()),
    },
  });
}
