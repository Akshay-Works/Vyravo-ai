// Cloudly Meeting Integration
// Connects CRM meetings to Cloudly for scheduling and management.
// 
// Required env vars:
//   CLOUDLY_API_KEY      — Cloudly API authentication
//   CLOUDLY_API_URL      — defaults to https://api.cloudly.com/v1
//
// The meetings table already exists (db/schema.ts). This module provides
// the Cloudly API abstraction; wire into meeting CRUD when credentials
// are available.

export interface CloudlyMeeting {
  title: string;
  description?: string;
  startTime: string;       // ISO 8601
  durationMinutes?: number;
  timezone?: string;
  attendees?: { name?: string; email: string }[];
  location?: string;
}

export function getCloudlyStatus(): { configured: boolean; message: string } {
  const key = process.env.CLOUDLY_API_KEY;
  return {
    configured: Boolean(key),
    message: key ? "Cloudly ready." : "Set CLOUDLY_API_KEY to connect.",
  };
}

export async function createCloudlyMeeting(meeting: CloudlyMeeting): Promise<{
  ok: boolean;
  meetingId?: string;
  meetingLink?: string;
  error?: string;
}> {
  const apiKey = process.env.CLOUDLY_API_KEY;
  if (!apiKey) return { ok: false, error: "CLOUDLY_API_KEY not configured" };

  try {
    const res = await fetch(`${process.env.CLOUDLY_API_URL || "https://api.cloudly.com/v1"}/meetings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        title: meeting.title,
        description: meeting.description,
        start_time: meeting.startTime,
        duration_minutes: meeting.durationMinutes || 30,
        timezone: meeting.timezone || "UTC",
        attendees: meeting.attendees || [],
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Cloudly error: ${res.status}`);
    const data = await res.json();
    return { ok: true, meetingId: data.id, meetingLink: data.meeting_link || data.join_url };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}
