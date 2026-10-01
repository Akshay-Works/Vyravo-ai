"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CopyButton from "./CopyButton";

const KIND_ICON: Record<string, string> = { logo: "🖼️", guideline: "📖", template: "📝", creative: "🎨", info: "ℹ️" };

export default function AssetCard({ asset, admin }: { asset: any; admin: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [name, setName] = useState(asset.name || "");
  const [kind, setKind] = useState(asset.kind || "info");
  const [body, setBody] = useState(asset.body || "");
  const input = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white";

  const save = async () => {
    if (busy || !name.trim()) return;
    setBusy(true); setMsg("");
    const r = await fetch(`/api/social/assets/${asset.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, kind, body }),
    });
    const j = await r.json();
    setBusy(false);
    if (!j.ok) { setMsg("❌ " + (j.error || "failed")); return; }
    setEditing(false);
    router.refresh();
  };

  const remove = async () => {
    if (!confirm(`Delete "${asset.name}"? This cannot be undone.`)) return;
    setBusy(true);
    const r = await fetch(`/api/social/assets/${asset.id}`, { method: "DELETE" });
    const j = await r.json();
    setBusy(false);
    if (!j.ok) { setMsg("❌ " + (j.error || "failed")); return; }
    router.refresh();
  };

  if (editing) {
    return (
      <div className="space-y-2 rounded-xl border border-primary/50 bg-surface p-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name *" className={input} />
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={input}>
          <option value="logo">🖼️ Logo / brand file</option>
          <option value="guideline">📖 Guideline</option>
          <option value="template">📝 Template</option>
          <option value="creative">🎨 Creative</option>
          <option value="info">ℹ️ Info / link</option>
        </select>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className={input} />
        <div className="flex gap-2">
          <button disabled={busy} onClick={save} className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold disabled:opacity-50">Save</button>
          <button onClick={() => { setEditing(false); setName(asset.name); setKind(asset.kind); setBody(asset.body); setMsg(""); }} className="rounded-lg bg-surface-2 px-4 py-1.5 text-xs">Cancel</button>
        </div>
        {msg && <p className="text-xs">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold">{KIND_ICON[asset.kind] || "📦"} {asset.name}</div>
        <div className="flex shrink-0 gap-1">
          <CopyButton text={asset.body || ""} />
          {admin && (
            <>
              <button onClick={() => setEditing(true)} className="rounded-lg bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-grey hover:text-white">Edit</button>
              <button onClick={remove} disabled={busy} className="rounded-lg bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-grey hover:text-red-400 disabled:opacity-50">Delete</button>
            </>
          )}
        </div>
      </div>
      <div className="mt-1 text-[11px] uppercase text-grey-dark">{asset.kind}</div>
      <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-xs text-grey">{asset.body}</p>
      {msg && <p className="mt-1 text-xs">{msg}</p>}
    </div>
  );
}
