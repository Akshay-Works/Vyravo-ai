// Centralized event tracking for analytics.
// Uses the existing analytics_events table. All events are stored with
// timestamp, type, and optional metadata.

import { db } from "@/db";
import { analyticsEvents } from "@/db/schema";

export type AnalyticsEventName =
  | "lead_created" | "lead_qualified" | "lead_lost"
  | "call_booked" | "call_completed" | "call_missed"
  | "proposal_created" | "proposal_sent" | "proposal_viewed" | "proposal_accepted" | "proposal_rejected"
  | "client_created" | "project_created" | "milestone_completed"
  | "invoice_created" | "payment_received"
  | "portal_login" | "file_uploaded" | "message_sent"
  | "knowledge_query" | "knowledge_gap"
  | "chat_started" | "chat_resolved"
  | "email_sent" | "email_opened" | "email_clicked"
  | "support_ticket_created" | "support_ticket_resolved"
  ;

export async function trackEvent(
  eventType: AnalyticsEventName | string,
  data?: {
    leadId?: number;
    clientId?: number;
    projectId?: number;
    service?: string;
    source?: string;
    value?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await db.insert(analyticsEvents).values({
      leadId: data?.leadId || null,
      eventType: eventType as any,
      eventData: (data?.metadata || {}) as any,
    });
  } catch (e) {
    console.error("Analytics event tracking error:", e);
  }
}
