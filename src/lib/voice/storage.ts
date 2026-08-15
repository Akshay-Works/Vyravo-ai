// Voice Receptionist — storage layer.
//
// Persists calls, transcripts, summaries and configuration using the EXISTING
// database connection (src/db). If the database is unreachable — or the voice
// tables don't exist yet — the store degrades gracefully to an in-memory store
// so Demo Mode always works. The current persistence mode is reported to the
// UI (via /api/voice/status) so nothing is ever misrepresented.
//
// Schema: src/db/schema.ts (voiceCalls, voiceConfig).
// To apply the schema properly, run:  npx drizzle-kit push
// Until then the store self-creates the tables on first use (idempotent).

import { db } from "@/db";
import { voiceCalls, voiceConfig } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { getDefaultConfig } from "./knowledge";
import type { CallRecord, LeadStatus, VoiceConfig } from "./types";

export type PersistenceMode = "database" | "memory";

export interface VoiceStore {
  mode: PersistenceMode;
  saveCall(record: CallRecord): Promise<void>;
  getCall(callId: string): Promise<CallRecord | null>;
  updateCall(callId: string, patch: Partial<CallRecord>): Promise<CallRecord | null>;
  listCalls(limit?: number): Promise<CallRecord[]>;
  getConfig(): Promise<VoiceConfig>;
  saveConfig(config: VoiceConfig): Promise<void>;
}

// ---------------------------------------------------------------------------
// Row ↔ record mapping
// ---------------------------------------------------------------------------

type DbCall = typeof voiceCalls.$inferSelect;
type DbConfig = typeof voiceConfig.$inferSelect;

function rowToRecord(row: DbCall): CallRecord {
  return {
    id: row.id,
    callId: row.callId,
    businessId: row.businessId,
    callerName: row.callerName,
    callerPhone: row.callerPhone,
    callerEmail: row.callerEmail,
    callerCompany: row.callerCompany,
    intent: row.intent,
    leadStatus: (row.leadStatus || "new") as LeadStatus,
    qualification: (row.qualification || {}) as CallRecord["qualification"],
    transcript: (row.transcript || []) as CallRecord["transcript"],
    summary: row.summary || "",
    outcome: row.outcome || "",
    actions: (row.actions || []) as string[],
    durationSec: row.durationSec || 0,
    followUpRequired: row.followUpRequired,
    followUpStatus: (row.followUpStatus || "none") as CallRecord["followUpStatus"],
    crmSyncStatus: (row.crmSyncStatus || "not_required") as CallRecord["crmSyncStatus"],
    emailStatus: (row.emailStatus || "not_required") as CallRecord["emailStatus"],
    source: (row.source || "demo") as CallRecord["source"],
    recordingAvailable: row.recordingAvailable,
    transcriptAvailable: row.transcriptAvailable,
    startedAt: (row.startedAt || new Date()).toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
  };
}

function rowToConfig(row: DbConfig): VoiceConfig {
  return {
    businessId: row.businessId,
    businessName: row.businessName,
    businessDescription: row.businessDescription || "",
    industry: row.industry || "",
    location: row.location || "",
    businessHours: row.businessHours || "",
    timeZone: row.timeZone || "",
    receptionistName: row.receptionistName,
    voice: row.voice || "",
    language: row.language || "",
    speakingStyle: row.speakingStyle || "",
    greeting: row.greeting,
    escalationEnabled: row.escalationEnabled,
    transferNumber: row.transferNumber,
    demoMode: row.demoMode,
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Database store
// ---------------------------------------------------------------------------

const CREATE_VOICE_CALLS = sql`
  CREATE TABLE IF NOT EXISTS receptionist_calls (
    id serial PRIMARY KEY,
    call_id varchar(64) NOT NULL UNIQUE,
    business_id varchar(64) NOT NULL DEFAULT 'vyravo-demo',
    caller_name text,
    caller_phone text,
    caller_email text,
    caller_company text,
    intent varchar(50),
    lead_status varchar(20) NOT NULL DEFAULT 'new',
    qualification jsonb,
    transcript jsonb,
    summary text,
    outcome varchar(60),
    actions jsonb,
    duration_sec integer NOT NULL DEFAULT 0,
    follow_up_required boolean NOT NULL DEFAULT false,
    follow_up_status varchar(20) NOT NULL DEFAULT 'none',
    crm_sync_status varchar(20) NOT NULL DEFAULT 'not_required',
    email_status varchar(20) NOT NULL DEFAULT 'not_required',
    source varchar(10) NOT NULL DEFAULT 'demo',
    recording_available boolean NOT NULL DEFAULT false,
    transcript_available boolean NOT NULL DEFAULT false,
    started_at timestamp NOT NULL DEFAULT now(),
    ended_at timestamp,
    created_at timestamp NOT NULL DEFAULT now()
  )`;

const CREATE_VOICE_CONFIG = sql`
  CREATE TABLE IF NOT EXISTS receptionist_config (
    id serial PRIMARY KEY,
    business_id varchar(64) NOT NULL UNIQUE DEFAULT 'vyravo-demo',
    business_name text NOT NULL,
    business_description text,
    industry text,
    location text,
    business_hours text,
    time_zone text,
    receptionist_name text NOT NULL,
    voice text,
    language text,
    speaking_style text,
    greeting text NOT NULL,
    escalation_enabled boolean NOT NULL DEFAULT true,
    transfer_number text,
    demo_mode boolean NOT NULL DEFAULT true,
    updated_at timestamp NOT NULL DEFAULT now()
  )`;

async function ensureVoiceTables(): Promise<void> {
  await db.execute(CREATE_VOICE_CALLS);
  await db.execute(CREATE_VOICE_CONFIG);
}

class DatabaseVoiceStore implements VoiceStore {
  mode: PersistenceMode = "database";
  private ready = false;
  private initPromise: Promise<boolean> | null = null;

  private init(): Promise<boolean> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          await ensureVoiceTables();
          this.ready = true;
          return true;
        } catch {
          this.ready = false;
          return false;
        }
      })();
    }
    return this.initPromise;
  }

  async saveCall(record: CallRecord): Promise<void> {
    await this.init();
    if (!this.ready) throw new Error("Voice tables unavailable");
    await db.insert(voiceCalls).values({
      callId: record.callId,
      businessId: record.businessId || "vyravo-demo",
      callerName: record.callerName,
      callerPhone: record.callerPhone,
      callerEmail: record.callerEmail,
      callerCompany: record.callerCompany,
      intent: record.intent,
      leadStatus: record.leadStatus,
      qualification: record.qualification,
      transcript: record.transcript,
      summary: record.summary,
      outcome: record.outcome,
      actions: record.actions,
      durationSec: record.durationSec,
      followUpRequired: record.followUpRequired,
      followUpStatus: record.followUpStatus,
      crmSyncStatus: record.crmSyncStatus,
      emailStatus: record.emailStatus,
      source: record.source,
      recordingAvailable: record.recordingAvailable,
      transcriptAvailable: record.transcriptAvailable,
      startedAt: new Date(record.startedAt),
      endedAt: record.endedAt ? new Date(record.endedAt) : null,
    });
  }

  async getCall(callId: string): Promise<CallRecord | null> {
    await this.init();
    if (!this.ready) throw new Error("Voice tables unavailable");
    const rows = await db.select().from(voiceCalls).where(eq(voiceCalls.callId, callId)).limit(1);
    return rows[0] ? rowToRecord(rows[0]) : null;
  }

  async updateCall(callId: string, patch: Partial<CallRecord>): Promise<CallRecord | null> {
    await this.init();
    if (!this.ready) throw new Error("Voice tables unavailable");
    const updates: Partial<typeof voiceCalls.$inferInsert> = {};
    if (patch.callerName !== undefined) updates.callerName = patch.callerName;
    if (patch.callerPhone !== undefined) updates.callerPhone = patch.callerPhone;
    if (patch.callerEmail !== undefined) updates.callerEmail = patch.callerEmail;
    if (patch.callerCompany !== undefined) updates.callerCompany = patch.callerCompany;
    if (patch.intent !== undefined) updates.intent = patch.intent;
    if (patch.leadStatus !== undefined) updates.leadStatus = patch.leadStatus;
    if (patch.qualification !== undefined) updates.qualification = patch.qualification;
    if (patch.transcript !== undefined) updates.transcript = patch.transcript;
    if (patch.summary !== undefined) updates.summary = patch.summary;
    if (patch.outcome !== undefined) updates.outcome = patch.outcome;
    if (patch.actions !== undefined) updates.actions = patch.actions;
    if (patch.durationSec !== undefined) updates.durationSec = patch.durationSec;
    if (patch.followUpRequired !== undefined) updates.followUpRequired = patch.followUpRequired;
    if (patch.followUpStatus !== undefined) updates.followUpStatus = patch.followUpStatus;
    if (patch.crmSyncStatus !== undefined) updates.crmSyncStatus = patch.crmSyncStatus;
    if (patch.emailStatus !== undefined) updates.emailStatus = patch.emailStatus;
    if (patch.endedAt !== undefined) updates.endedAt = patch.endedAt ? new Date(patch.endedAt) : null;
    await db.update(voiceCalls).set(updates).where(eq(voiceCalls.callId, callId));
    return this.getCall(callId);
  }

  async listCalls(limit = 100): Promise<CallRecord[]> {
    await this.init();
    if (!this.ready) throw new Error("Voice tables unavailable");
    const rows = await db
      .select()
      .from(voiceCalls)
      .orderBy(desc(voiceCalls.startedAt))
      .limit(limit);
    return rows.map(rowToRecord);
  }

  async getConfig(): Promise<VoiceConfig> {
    await this.init();
    if (!this.ready) throw new Error("Voice tables unavailable");
    const rows = await db.select().from(voiceConfig).where(eq(voiceConfig.businessId, "vyravo-demo")).limit(1);
    if (rows[0]) return rowToConfig(rows[0]);
    const defaults = getDefaultConfig();
    await db.insert(voiceConfig).values({
      businessId: defaults.businessId,
      businessName: defaults.businessName,
      businessDescription: defaults.businessDescription,
      industry: defaults.industry,
      location: defaults.location,
      businessHours: defaults.businessHours,
      timeZone: defaults.timeZone,
      receptionistName: defaults.receptionistName,
      voice: defaults.voice,
      language: defaults.language,
      speakingStyle: defaults.speakingStyle,
      greeting: defaults.greeting,
      escalationEnabled: defaults.escalationEnabled,
      transferNumber: defaults.transferNumber,
      demoMode: defaults.demoMode,
    });
    return defaults;
  }

  async saveConfig(config: VoiceConfig): Promise<void> {
    await this.init();
    if (!this.ready) throw new Error("Voice tables unavailable");
    await db
      .insert(voiceConfig)
      .values({
        businessId: config.businessId || "vyravo-demo",
        businessName: config.businessName,
        businessDescription: config.businessDescription,
        industry: config.industry,
        location: config.location,
        businessHours: config.businessHours,
        timeZone: config.timeZone,
        receptionistName: config.receptionistName,
        voice: config.voice,
        language: config.language,
        speakingStyle: config.speakingStyle,
        greeting: config.greeting,
        escalationEnabled: config.escalationEnabled,
        transferNumber: config.transferNumber,
        demoMode: config.demoMode,
      })
      .onConflictDoUpdate({
        target: voiceConfig.businessId,
        set: {
          businessName: config.businessName,
          businessDescription: config.businessDescription,
          industry: config.industry,
          location: config.location,
          businessHours: config.businessHours,
          timeZone: config.timeZone,
          receptionistName: config.receptionistName,
          voice: config.voice,
          language: config.language,
          speakingStyle: config.speakingStyle,
          greeting: config.greeting,
          escalationEnabled: config.escalationEnabled,
          transferNumber: config.transferNumber,
          demoMode: config.demoMode,
          updatedAt: new Date(),
        },
      });
  }
}

// ---------------------------------------------------------------------------
// In-memory store (fallback so Demo Mode always works)
// ---------------------------------------------------------------------------

class MemoryVoiceStore implements VoiceStore {
  mode: PersistenceMode = "memory";
  private calls = new Map<string, CallRecord>();
  private config: VoiceConfig = getDefaultConfig();

  async saveCall(record: CallRecord): Promise<void> {
    this.calls.set(record.callId, { ...record });
  }

  async getCall(callId: string): Promise<CallRecord | null> {
    return this.calls.get(callId) || null;
  }

  async updateCall(callId: string, patch: Partial<CallRecord>): Promise<CallRecord | null> {
    const existing = this.calls.get(callId);
    if (!existing) return null;
    const updated: CallRecord = { ...existing, ...patch };
    this.calls.set(callId, updated);
    return updated;
  }

  async listCalls(limit = 100): Promise<CallRecord[]> {
    return [...this.calls.values()]
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
      .slice(0, limit);
  }

  async getConfig(): Promise<VoiceConfig> {
    return { ...this.config };
  }

  async saveConfig(config: VoiceConfig): Promise<void> {
    this.config = { ...config, updatedAt: new Date().toISOString() };
  }
}

// ---------------------------------------------------------------------------
// Singleton with graceful degradation
// ---------------------------------------------------------------------------

let store: VoiceStore | null = null;

export function getVoiceStore(): VoiceStore {
  if (store) return store;
  // VOICE_STORE=memory forces the in-memory store (used for local testing).
  if (process.env.VOICE_STORE === "memory") {
    store = new MemoryVoiceStore();
    return store;
  }
  // The existing db connection is always constructed (src/db). Database mode
  // is attempted first; any failure falls back to memory for the process.
  store = new DatabaseVoiceStore();
  return store;
}

/** Swap the store (used internally when DB probing fails). */
export function setVoiceStore(next: VoiceStore): void {
  store = next;
}

/**
 * Run a store operation with graceful degradation: if the database store
 * fails (unreachable DB, missing tables), fall back to the in-memory store
 * for this process and retry once. Demo Mode keeps working either way.
 */
export async function withStore<T>(fn: (s: VoiceStore) => Promise<T>): Promise<T> {
  const s = getVoiceStore();
  try {
    return await fn(s);
  } catch (e) {
    if (s.mode === "database") {
      console.warn("[voice] Database store unavailable, falling back to in-memory store:", String((e as Error)?.message || e).slice(0, 200));
      const memory = new MemoryVoiceStore();
      setVoiceStore(memory);
      return await fn(memory);
    }
    throw e;
  }
}
