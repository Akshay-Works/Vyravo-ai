// Proposal formatting helpers — pure, client-safe.

export function formatMoney(value: number | string | null | undefined, currency: string | null | undefined = "USD"): string {
  const n = Number(value ?? 0);
  const symbol = currency === "USD" ? "$" : currency === "INR" ? "₹" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "";
  try {
    return `${symbol}${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
  } catch {
    return `${symbol}${n}`;
  }
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
}

export function daysBetween(a: string | Date, b: string | Date): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

export function expiryDate(days: number | null | undefined, from?: Date): Date {
  const base = from || new Date();
  const d = new Date(base);
  d.setDate(d.getDate() + (days ?? 14));
  return d;
}

export function proposalNumber(id: number): string {
  return `VYV-${String(id).padStart(4, "0")}`;
}

export function timeAgo(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}
