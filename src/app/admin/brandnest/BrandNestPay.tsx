"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function MarkPaidClient({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy || !confirm(`Mark project #${id} as PAID? Only confirm for real received money.`)) return;
    setBusy(true);
    await fetch(`/api/admin/brandnest/projects/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "paid", paymentDate: new Date().toISOString() }),
    });
    setBusy(false);
    router.refresh();
  };
  return (
    <button onClick={go} disabled={busy}
      className="rounded-lg border border-green-500/40 bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-400 disabled:opacity-40">
      {busy ? "…" : "Mark paid"}
    </button>
  );
}
