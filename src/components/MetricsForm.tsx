"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PLATFORMS = ["linkedin", "instagram", "x", "facebook", "youtube"];

function fmtWhen(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export default function MetricsForm({ latest }: { latest?: any[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [f, setF] = useState({ platform: "linkedin", date: todayIST(), followers: "", reach: "", engagement: "", posts: "", notes: "" });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const last = (latest || []).find((p) => p.platform === f.platform);
  const input = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white";

  const save = async () => {
    if (busy) return;
    const body: any = { platform: f.platform, date: f.date || undefined, notes: f.notes || undefined };
    if (f.followers !== "") body.followers = Number(f.followers);
    if (f.reach !== "") body.reach = Number(f.reach);
    if (f.engagement !== "") body.engagement = Number(f.engagement);
    if (f.posts !== "") body.posts = Number(f.posts);
    if (body.followers == null && body.reach == null && body.engagement == null && body.posts == null) {
      setMsg("❌ Enter at least one number — leave the rest blank to keep the previous value.");
      return;
    }
    setBusy(true); setMsg("");
    const r = await fetch("/api/social/analytics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!j.ok) { setMsg("❌ " + (j.error || "failed")); return; }
    setF((s) => ({ ...s, followers: "", reach: "", engagement: "", posts: "", notes: "" }));
    setMsg("✅ Saved — dashboard updated.");
    router.refresh();
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">⚡ Update live stats</h2>
        {last && (
          <span className="text-[11px] text-grey">
            {f.platform}: {Number(last.followers || 0).toLocaleString("en-IN")} followers
            {last.recorded_at ? ` · last ${fmtWhen(last.recorded_at)}` : ""}
            {last.recorded_by_name ? ` · ${last.recorded_by_name}` : ""}
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-grey">
        LinkedIn does not let apps pull follower counts without their Marketing API partnership.
        Open the LinkedIn page, paste the numbers here — leave a field blank to keep the last value. History is kept every save.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <select value={f.platform} onChange={(e) => set("platform", e.target.value)} className={input}>
          {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} className={input} />
        <input value={f.followers} onChange={(e) => set("followers", e.target.value)} placeholder={last ? `Followers (now ${last.followers})` : "Followers"} inputMode="numeric" className={input} />
        <input value={f.reach} onChange={(e) => set("reach", e.target.value)} placeholder={last?.reach != null ? `Reach (now ${last.reach})` : "Reach"} inputMode="numeric" className={input} />
        <input value={f.engagement} onChange={(e) => set("engagement", e.target.value)} placeholder={last?.engagement != null ? `Engagement (now ${last.engagement})` : "Engagement"} inputMode="numeric" className={input} />
        <input value={f.posts} onChange={(e) => set("posts", e.target.value)} placeholder={last?.posts != null ? `Posts (now ${last.posts})` : "Posts"} inputMode="numeric" className={input} />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <input value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional note (e.g. after carousel post)" className={`${input} min-w-0 flex-1`} />
        <button disabled={busy} onClick={save} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold disabled:opacity-50">Save snapshot</button>
      </div>
      {msg && <p className="mt-2 text-xs">{msg}</p>}
    </div>
  );
}
