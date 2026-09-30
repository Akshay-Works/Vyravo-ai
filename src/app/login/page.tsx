"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/auth/employee", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const j = await r.json();
      if (j.ok) router.push(j.redirect || "/admin");
      else setMsg(j.error || "Login failed");
    } catch {
      setMsg("Network error — try again.");
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-lg font-bold text-white">V</div>
          <div>
            <div className="font-[var(--font-heading)] text-lg font-semibold text-white">Vyravo AI</div>
            <div className="text-xs text-grey">Workspace login</div>
          </div>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="Work email" autoComplete="username"
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-white placeholder:text-grey-dark" />
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Password" autoComplete="current-password"
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-white placeholder:text-grey-dark" />
          <button disabled={busy}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Signing in…" : "Sign in"}
          </button>
          {msg && <p className="text-center text-xs text-red-400">{msg}</p>}
        </form>
        <p className="mt-6 text-center text-[11px] text-grey-dark">Your workspace opens automatically based on your role.</p>
      </div>
    </div>
  );
}
