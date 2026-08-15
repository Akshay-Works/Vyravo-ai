// Voice Receptionist — client-side API helper.
// Adds the admin key (kept in sessionStorage, never persisted) when the
// server requires it. Handles 401 by flagging that a key is needed.

const KEY_NAME = "vyravo_admin_key";

export function getAdminKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return sessionStorage.getItem(KEY_NAME) || "";
  } catch {
    return "";
  }
}

export function setAdminKey(key: string): void {
  try {
    sessionStorage.setItem(KEY_NAME, key.trim());
  } catch {
    // storage unavailable — key stays in memory only
  }
}

export class VoiceApiError extends Error {
  status: number;
  needsAdminKey: boolean;
  constructor(message: string, status: number, needsAdminKey = false) {
    super(message);
    this.status = status;
    this.needsAdminKey = needsAdminKey;
  }
}

export async function voiceFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) || {}),
  };
  const key = getAdminKey();
  if (key) headers["x-admin-key"] = key;

  const res = await fetch(path, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    throw new VoiceApiError(data.error || "Unauthorized — admin key required.", 401, true);
  }
  if (!res.ok) {
    throw new VoiceApiError(data.error || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

export function formatDuration(sec: number): string {
  if (!sec) return "0s";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}
