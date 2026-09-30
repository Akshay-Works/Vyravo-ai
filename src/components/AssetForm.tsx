"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AssetForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("info");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const input = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white";
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <button onClick={() => setOpen((o) => !o)} className="text-sm font-semibold text-primary">+ Add asset</button>
      {open && (
        <div className="mt-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name *" className={input} />
            <select value={kind} onChange={(e) => setKind(e.target.value)} className={input}>
              <option value="logo">🖼️ Logo / brand file</option>
              <option value="guideline">📖 Guideline</option>
              <option value="template">📝 Template</option>
              <option value="creative">🎨 Creative</option>
              <option value="info">ℹ️ Info / link</option>
            </select>
          </div>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="URL or text…" rows={3} className={input} />
          <button disabled={busy || !name.trim()} onClick={async () => {
            setBusy(true);
            await fetch("/api/social/assets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, kind, body }) });
            setBusy(false); setOpen(false); setName(""); setBody("");
            router.refresh();
          }} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold disabled:opacity-50">Save asset</button>
        </div>
      )}
    </div>
  );
}
