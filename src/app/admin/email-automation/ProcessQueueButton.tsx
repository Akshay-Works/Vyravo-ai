"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ProcessQueueButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const run = async () => {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/admin/emails/process", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(d.error || "Failed"); return; }
      setMsg(`✓ sent ${d.sent}, failed ${d.failed}`);
      router.refresh();
    } catch {
      setMsg("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={run} disabled={busy}
        className="rounded-lg border border-green-500/40 px-4 py-2 text-sm text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-50">
        {busy ? "Processing…" : "⚡ Process queue now"}
      </button>
      {msg && <span className="text-xs text-grey">{msg}</span>}
    </div>
  );
}
