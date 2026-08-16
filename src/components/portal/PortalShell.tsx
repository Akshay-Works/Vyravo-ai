"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";

const NAV = [
  { href: "/portal/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/portal/projects", label: "Projects", icon: "📋" },
  { href: "/portal/proposals", label: "Proposals", icon: "📄" },
  { href: "/portal/invoices", label: "Invoices", icon: "💰" },
  { href: "/portal/files", label: "Files", icon: "📁" },
  { href: "/portal/messages", label: "Messages", icon: "💬" },
  { href: "/portal/tickets", label: "Support", icon: "🎫" },
  { href: "/portal/activity", label: "Activity", icon: "📈" },
  { href: "/portal/settings", label: "Settings", icon: "⚙️" },
];

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const logout = async () => {
    await fetch("/api/portal/auth", { method: "DELETE" });
    router.push("/portal/login");
  };

  return (
    <div className="min-h-screen bg-bg">
      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="hidden sm:inline-block text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary">
              Client Portal
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-xs text-grey hover:text-white transition-colors px-3 py-2 rounded-lg hover:bg-white/5">
              ← Website
            </Link>
            <button onClick={logout} className="text-xs px-3 py-2 rounded-lg border border-border text-grey hover:text-white hover:border-primary/40 transition-colors">
              Logout
            </button>
            <button className="md:hidden p-2 text-grey" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <aside className="hidden md:block fixed left-0 top-16 bottom-0 w-56 border-r border-border bg-surface/40 overflow-y-auto">
        <nav className="p-3 space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.href || (item.href !== "/portal/dashboard" && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${active ? "bg-primary/10 text-primary border border-primary/20" : "text-grey hover:text-white hover:bg-white/5 border border-transparent"}`}>
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 top-16 z-40 glass border-t border-border">
          <nav className="p-4 space-y-1">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                className={`block px-4 py-3 rounded-lg text-sm ${pathname === item.href ? "bg-primary/10 text-primary" : "text-grey hover:text-white hover:bg-white/5"}`}>
                {item.icon} {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}

      {/* Main */}
      <main className="md:pl-56 pt-16 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
