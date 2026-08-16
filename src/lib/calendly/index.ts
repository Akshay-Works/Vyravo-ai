// Calendly Meeting Integration
// Connects CRM meetings to Calendly for scheduling and availability.
//
// Required env var: CALENDLY_ACCESS_TOKEN
// Your Calendly URL: https://calendly.com/akshay-navale-work

const CALENDLY_API = "https://api.calendly.com";
const CALENDLY_USER_URI = "https://api.calendly.com/users/e2dbd741-91ad-48d6-848d-5b3bd982e423";

export interface CalendlyScheduledEvent {
  uri: string;
  name: string;
  status: string;
  startTime: string;
  endTime: string;
  inviteeEmail?: string;
  inviteeName?: string;
}

function getToken(): string | null {
  return process.env.CALENDLY_ACCESS_TOKEN || null;
}

export function isCalendlyConfigured(): boolean {
  return Boolean(getToken());
}

async function calendlyFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = getToken();
  if (!token) throw new Error("CALENDLY_ACCESS_TOKEN not configured");
  const res = await fetch(`${CALENDLY_API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Calendly error (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function listEventTypes(): Promise<{ uri: string; name: string; duration: number; slug: string }[]> {
  const data = await calendlyFetch(`/event_types?user=${encodeURIComponent(CALENDLY_USER_URI)}`);
  return (data.collection || []).map((et: any) => ({ uri: et.uri, name: et.name, duration: et.duration, slug: et.slug }));
}

export async function listScheduledEvents(opts: { count?: number; status?: string } = {}): Promise<CalendlyScheduledEvent[]> {
  const params = new URLSearchParams({ user: CALENDLY_USER_URI, count: String(opts.count || 50) });
  if (opts.status) params.set("status", opts.status);
  const data = await calendlyFetch(`/scheduled_events?${params}`);
  return (data.collection || []).map((ev: any) => ({
    uri: ev.uri, name: ev.name, status: ev.status, startTime: ev.start_time, endTime: ev.end_time,
    inviteeEmail: ev.invitee?.email, inviteeName: ev.invitee?.name,
  }));
}
