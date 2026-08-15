// Voice Receptionist — shared types.
// Mirrors the existing chatbot architecture: pure types, no framework imports.

export interface VoiceConfig {
  businessId: string;
  // Business information
  businessName: string;
  businessDescription: string;
  industry: string;
  location: string;
  businessHours: string;
  timeZone: string;
  // Receptionist identity
  receptionistName: string;
  voice: string;
  language: string;
  speakingStyle: string;
  greeting: string;
  // Escalation
  escalationEnabled: boolean;
  transferNumber: string | null;
  // Mode
  demoMode: boolean;
  updatedAt?: string;
}

export interface TranscriptMessage {
  role: "receptionist" | "caller" | "system";
  text: string;
  at: string; // ISO timestamp
}

export type Qualification = {
  [key: string]: string | undefined;
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
  serviceInterest?: string;
  requirements?: string;
  budgetRange?: string;
  preferredContactTime?: string;
};

export type LeadStatus = "new" | "qualified" | "customer";

export type CrmSyncStatus = "synced" | "failed" | "not_required";
export type EmailStatus = "triggered" | "failed" | "not_required";
export type FollowUpStatus = "none" | "pending" | "done";

export interface CallRecord {
  id?: number; // db row id when persisted
  callId: string;
  businessId: string;
  callerName: string | null;
  callerPhone: string | null;
  callerEmail: string | null;
  callerCompany: string | null;
  intent: string | null;
  leadStatus: LeadStatus;
  qualification: Qualification;
  transcript: TranscriptMessage[];
  summary: string;
  outcome: string;
  actions: string[];
  durationSec: number;
  followUpRequired: boolean;
  followUpStatus: FollowUpStatus;
  crmSyncStatus: CrmSyncStatus;
  emailStatus: EmailStatus;
  source: "demo" | "live";
  recordingAvailable: boolean;
  transcriptAvailable: boolean;
  startedAt: string; // ISO
  endedAt: string | null; // ISO
}

export interface CallTurn {
  reply: string;
  actions: string[];
  leadStatus: LeadStatus;
  leadQualified: boolean;
  intent: string | null;
  callEnded: boolean;
  bookingRequested: boolean;
}

export interface CallSummary {
  summary: string;
  outcome: string;
  followUpRequired: boolean;
  leadStatus: LeadStatus;
  intent: string | null;
  actions: string[];
}

export interface ProviderStatus {
  id: string;
  mode: "demo" | "live";
  connected: boolean;
  supportsTransfer: boolean;
  label: string;
}

export interface VoiceStats {
  totalCalls: number;
  todayCalls: number;
  answeredCalls: number;
  missedCalls: number;
  qualifiedLeads: number;
  appointmentsBooked: number;
  escalations: number;
  averageDurationSec: number;
  leadConversionRate: number; // 0..1
  demoMode: boolean;
}
