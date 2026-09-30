"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MetricsForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ platform: "instagram", date: "", followers: "", reach: "", engagement: "", posts: "" });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const input = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white";
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <button onClick={() => setOpen((o) => !o)} className="text-sm font-semibold text-primary">+ Record metrics (admin)</button>
      {open && (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <select value={f.platform} onChange={(e) => set("platform", e.target.value)} className={input}>
            {["instagram", "linkedin", "x", "facebook", "youtube"].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} className={input} />
          <input value={f.followers} onChange={(e) => set("followers", e.target.value)} placeholder="Followers" inputMode="numeric" className={input} />
          <input value={f.reach} onChange={(e) => set("reach", e.target.value)} placeholder="Reach" inputMode="numeric" className={input} />
          <input value={f.engagement} onChange={(e) => set("engagement", e.target.value)} placeholder="Engagement" inputMode="numeric" className={input} />
          <input value={f.posts} onChange={(e) => set("posts", e.target.value)} placeholder="Posts" inputMode="numeric" className={input} />
          <button disabled={busy} onClick={async () => {
            setBusy(true);
            await fetch("/api/social/analytics", { method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ platform: f.platform, date: f.date || undefined, followers: Number(f.followers) || 0, reach: Number(f.reach) || 0, engagement: Number(f.engagement) || 0, posts: Number(f.posts) || 0 }) });
            setBusy(false); setOpen(false);
            router.refresh();
          }} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold disabled:opacity-50">Save</button>
        </div>
      )}
    </div>
  );
}
