"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function PortalSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    fetch("/api/portal/auth").then((r) => r.json()).then((d) => setUser(d.user || null)).catch(() => {});
  }, []);

  const logout = async () => {
    await fetch("/api/portal/auth", { method: "DELETE" });
    router.push("/portal/login");
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold font-[var(--font-heading)]"><span className="gradient-text">Settings</span></h1>
      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-4">Account</h2>
        {user ? (
          <div className="space-y-3">
            <div><p className="text-xs text-grey-dark">Name</p><p className="text-sm text-white">{user.name}</p></div>
            <div><p className="text-xs text-grey-dark">Email</p><p className="text-sm text-white">{user.email}</p></div>
            <div><p className="text-xs text-grey-dark">Role</p><p className="text-sm text-white capitalize">{user.role}</p></div>
          </div>
        ) : <p className="text-sm text-grey">Loading...</p>}
      </div>
      <button onClick={logout} className="text-sm px-4 py-2.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">Sign Out</button>
    </div>
  );
}
