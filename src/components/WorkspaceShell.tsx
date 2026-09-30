"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export interface NavItem { href: string; label: string; icon: string }

export default function WorkspaceShell({ items, title, accent, homeHref, admin, userName, children }: {
  items: NavItem[]; title: string; accent: string; homeHref: string;
  admin: boolean; userName: string; children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/me/notifications").then((r) => r.json()).then((j) => {
      if (j.ok) { setUnread(j.unread || 0); setNotes(j.notifications || []); }
    }).catch(() => {});
  }, []);

  const markAll = async () => {
    await fetch("/api/me/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ all: true }) });
    setUnread(0);
    setNotes((ns) => ns.map((n) => ({ ...n, read_at: new Date().toISOString() })));
  };

  const logout = async () => {
    await fetch("/api/auth/admin", { method: "DELETE" }).catch(() => {});
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-bg text-white">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Link href={homeHref} className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${accent} text-sm font-bold text-white`}>V</div>
            <span className="font-[var(--font-heading)] text-sm font-semibold">{title}</span>
          </Link>
          {admin && (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400">
              Admin view — all data, all controls
            </span>
          )}
          <div className="ml-auto flex items-center gap-3">
            <button onClick={() => setShowNotes((s) => !s)} className="relative rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm" title="Notifications">
              🔔{unread > 0 && <span className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 px-1.5 text-[10px] font-bold">{unread}</span>}
            </button>
            {admin && (
              <Link href="/admin" className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-grey hover:text-white">
                ← Admin
              </Link>
            )}
            <span className="hidden text-xs text-grey sm:inline">{userName}</span>
            <button onClick={logout} className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-grey hover:text-white">
              Logout
            </button>
          </div>
        </div>
        {showNotes && (
          <div className="mx-auto max-w-7xl px-4 pb-3">
            <div className="rounded-lg border border-border bg-surface-2 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-grey">Notifications</span>
                <button onClick={markAll} className="text-xs text-primary">Mark all read</button>
              </div>
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {notes.length === 0 && <p className="text-xs text-grey-dark">No notifications.</p>}
                {notes.map((n) => (
                  <div key={n.id} className={`rounded-lg border border-border p-2 text-xs ${n.read_at ? "opacity-60" : ""}`}>
                    <div className="font-semibold">{n.title}</div>
                    {n.body && <div className="text-grey">{n.body}</div>}
                    {n.link && <Link href={n.link} className="text-primary">Open →</Link>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside className="hidden w-52 shrink-0 md:block">
          <nav className="sticky top-20 space-y-1">
            {items.map((it) => (
              <Link key={it.href} href={it.href}
                className={`block rounded-lg px-3 py-2 text-sm ${path === it.href ? "bg-primary/15 font-semibold text-white" : "text-grey hover:bg-surface-2 hover:text-white"}`}>
                <span className="mr-2">{it.icon}</span>{it.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <nav className="fixed bottom-0 left-0 right-0 z-20 flex justify-around border-t border-border bg-surface px-2 py-2 md:hidden">
        {items.slice(0, 5).map((it) => (
          <Link key={it.href} href={it.href} className={`px-2 py-1 text-lg ${path === it.href ? "" : "opacity-50"}`} title={it.label}>{it.icon}</Link>
        ))}
      </nav>
      <div className="h-14 md:hidden" />
    </div>
  );
}
