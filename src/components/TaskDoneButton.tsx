"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TaskDoneButton({ leadId, taskId }: { leadId: number; taskId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button disabled={busy} onClick={async () => {
      if (busy) return;
      setBusy(true);
      await fetch(`/api/sales/leads/${leadId}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "task_done", taskId }),
      }).catch(() => {});
      router.refresh();
    }} className="rounded-lg bg-emerald-600/20 px-2.5 py-1.5 text-xs font-semibold text-emerald-400 disabled:opacity-50">
      ✓ Done
    </button>
  );
}
