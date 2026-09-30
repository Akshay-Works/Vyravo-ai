"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

async function post(body: any) {
  const r = await fetch("/api/admin/employees", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "failed");
  return j;
}

export default function EmployeesPage() {
  const [tab, setTab] = useState<"sales" | "social" | "activity" | "approvals">("sales");
  const [d, setD] = useState<any>({ employees: [], activity: [], approvals: [] });
  const [msg, setMsg] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [f, setF] = useState({ name: "", email: "", password: "", role: "sales" });
  const [assign, setAssign] = useState({ leadIds: "", userId: "" });

  const tabParam = (t: string) => (t === "activity" ? "activity" : t === "approvals" ? "approvals" : "team");
  const load = async (t: string) => {
    const r = await fetch(`/api/admin/employees?tab=${tabParam(t)}`);
    const j = await r.json();
    if (j.ok) setD(j);
  };
  useEffect(() => {
    let live = true;
    fetch(`/api/admin/employees?tab=${tabParam(tab)}`)
      .then((r) => r.json())
      .then((j) => { if (live && j.ok) setD(j); })
      .catch(() => {});
    return () => { live = false; };
  }, [tab]);

  const act = async (fn: () => Promise<any>, ok: string) => {
    setMsg("");
    try { await fn(); setMsg("✅ " + ok); await load(tab); }
    catch (e: any) { setMsg("❌ " + (e.message || "failed")); }
  };

  const sales = d.employees.filter((e: any) => e.workspace_role === "sales");
  const social = d.employees.filter((e: any) => e.workspace_role === "social");
  const admins = d.employees.filter((e: any) => e.workspace_role === "admin");
  const input = "rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-[var(--font-heading)] text-xl font-bold">🧑‍💼 Employees</h1>
        <div className="ml-auto flex gap-2">
          <Link href="/sales" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold">Open Sales workspace →</Link>
          <Link href="/social" className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold">Open Social workspace →</Link>
        </div>
      </div>

      <div className="flex gap-1">
        {(["sales", "social", "activity", "approvals"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${tab === t ? "bg-primary text-white" : "bg-surface-2 text-grey"}`}>
            {t === "sales" ? `📞 Sales (${sales.length})` : t === "social" ? `🎨 Social (${social.length})` : t === "activity" ? "🧾 Activity" : `⏳ Approvals (${d.approvals.length})`}
          </button>
        ))}
        <button onClick={() => setShowCreate((s) => !s)} className="ml-auto rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-semibold text-primary">
          + Add employee
        </button>
      </div>
      {msg && <p className="text-xs">{msg}</p>}

      {showCreate && (
        <div className="grid gap-2 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Full name *" className={input} />
          <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="Email *" className={input} />
          <input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="Password (8+ chars) *" type="password" className={input} />
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className={input}>
            <option value="sales">📞 Sales</option>
            <option value="social">🎨 Social media</option>
            <option value="admin">👑 Admin</option>
          </select>
          <button onClick={() => act(() => post({ action: "create", ...f }), "employee created — they can sign in at /login")}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold">Create</button>
        </div>
      )}

      {(tab === "sales" || tab === "social") && (
        <>
          <div className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-2 text-sm font-semibold">{tab === "sales" ? "📞 Sales team" : "🎨 Social team"}</h2>
            <div className="space-y-2">
              {(tab === "sales" ? sales : social).map((e: any) => (
                <div key={e.id} className={`rounded-lg border p-2.5 text-sm ${e.is_active ? "border-border bg-surface-2" : "border-red-500/40 bg-surface-2 opacity-60"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{e.name}</span>
                    <span className="text-xs text-grey">{e.email}</span>
                    {!e.is_active && <span className="text-xs font-bold text-red-400">disabled</span>}
                    <span className="ml-auto flex gap-1">
                      <button onClick={() => act(() => post({ action: "status", id: e.id, active: !e.is_active }), e.is_active ? "disabled (sessions killed)" : "enabled")}
                        className="rounded bg-surface px-2 py-1 text-[11px]">{e.is_active ? "Disable" : "Enable"}</button>
                      <button onClick={() => {
                        const r = prompt("Role (admin/sales/social):", e.workspace_role);
                        if (r) act(() => post({ action: "role", id: e.id, role: r }), "role updated");
                      }} className="rounded bg-surface px-2 py-1 text-[11px]">Role</button>
                      <button onClick={() => {
                        const p = prompt(`New password for ${e.name} (8+ characters):`);
                        if (p) act(() => post({ action: "reset_pw", id: e.id, password: p }), "password reset — share it with them securely");
                      }} className="rounded bg-surface px-2 py-1 text-[11px]">Reset PW</button>
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-grey">
                    👥 {e.assigned_leads ?? 0} leads · 📌 {e.open_tasks ?? 0} open tasks
                    {tab === "social" ? ` · ✅ ${e.open_content_tasks ?? 0} content tasks` : ""}
                    {e.last_active_at ? ` · last active ${new Date(e.last_active_at).toLocaleString("en-IN")}` : " · never active"}
                  </div>
                  {tab === "sales" && (
                    <Link href={`/sales/performance?userId=${e.id}`} className="text-[11px] text-primary">View performance →</Link>
                  )}
                </div>
              ))}
              {(tab === "sales" ? sales : social).length === 0 && <p className="text-xs text-grey">No {tab} employees yet.</p>}
            </div>
          </div>

          {tab === "sales" && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <h2 className="mb-2 text-sm font-semibold">🔀 Assign leads (comma-separated IDs)</h2>
              <div className="flex flex-wrap gap-2">
                <input value={assign.leadIds} onChange={(e) => setAssign({ ...assign, leadIds: e.target.value })}
                  placeholder="e.g. 101, 102, 103" className={`${input} min-w-0 flex-1`} />
                <select value={assign.userId} onChange={(e) => setAssign({ ...assign, userId: e.target.value })} className={input}>
                  <option value="">Unassign</option>
                  {[...sales, ...admins].filter((e: any) => e.is_active).map((e: any) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
                <button onClick={() => act(() => post({ action: "assign", leadIds: assign.leadIds.split(/[,\s]+/).map(Number).filter(Boolean), userId: assign.userId ? Number(assign.userId) : null }), "assignment saved")}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold">Apply</button>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-2 text-sm font-semibold">👑 Admins ({admins.length})</h2>
            {admins.map((e: any) => (
              <p key={e.id} className="text-xs text-grey">{e.name} ({e.email}){e.is_active ? "" : " — disabled"}</p>
            ))}
          </div>
        </>
      )}

      {tab === "activity" && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold">🧾 Employee activity (audit log)</h2>
          <div className="max-h-[60vh] space-y-1 overflow-y-auto text-xs">
            {d.activity.map((a: any) => (
              <p key={a.id} className="rounded bg-surface-2 p-1.5">
                <span className="text-grey-dark">{new Date(a.created_at).toLocaleString("en-IN")}</span>{" "}
                <b>{a.user_name || "?"}</b> <span className="text-grey">({a.role})</span>{" "}
                <span className="font-mono">{a.action}</span>{" "}
                <span className="text-grey">{a.object}{a.object_id ? ` #${a.object_id}` : ""}</span>
              </p>
            ))}
            {d.activity.length === 0 && <p className="text-grey">No activity yet.</p>}
          </div>
        </div>
      )}

      {tab === "approvals" && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold">⏳ Content awaiting approval ({d.approvals.length})</h2>
          <div className="space-y-2">
            {d.approvals.map((p: any) => (
              <div key={p.id} className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold capitalize">📱 {p.platform} · {p.content_type}</span>
                  <span className="text-grey">by {p.author_name || "?"}</span>
                  <Link href={`/social/create?id=${p.id}`} className="ml-auto text-primary">Review →</Link>
                </div>
                <p className="mt-1 line-clamp-3 text-grey">{p.caption || "(no caption)"}</p>
              </div>
            ))}
            {d.approvals.length === 0 && <p className="text-xs text-grey">Queue is clear 🎉</p>}
          </div>
        </div>
      )}
    </div>
  );
}
