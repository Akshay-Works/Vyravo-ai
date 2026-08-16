"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";

const NAV_ITEMS = [
  { href: "/admin/analytics", label: "Analytics", icon: "📊" },
  { href: "/admin/crm/clients", label: "CRM", icon: "👥" },
  { href: "/admin/workflows", label: "Workflows", icon: "⚡" },
  { href: "/admin/portal/clients", label: "Portal Clients", icon: "👥" },
  { href: "/admin/proposals", label: "Proposals", icon: "📄" },
  { href: "/admin/knowledge-base", label: "KB Dashboard", icon: "📊" },
  { href: "/admin/knowledge-base/documents", label: "Document Library", icon: "📚" },
  { href: "/admin/knowledge-base/documents/upload", label: "Upload", icon: "📤" },
  { href: "/admin/knowledge-base/articles", label: "Articles", icon: "📝" },
  { href: "/admin/knowledge-base/search", label: "Search", icon: "🔍" },
  { href: "/admin/knowledge-base/assistant", label: "AI Assistant", icon: "🤖" },
  { href: "/admin/knowledge-base/gaps", label: "Knowledge Gaps", icon: "🕳️" },
];

export function KBShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/admin", { method: "DELETE" });
    router.push("/admin/login");
  };

  return (
    <div className="min-h-screen bg-bg">
      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="hidden sm:inline-block text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary">
              Internal Knowledge Base
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs text-grey hover:text-white transition-colors px-3 py-2 rounded-lg hover:bg-white/5"
            >
              ← Back to Website
            </Link>
            <button
              onClick={handleLogout}
              className="text-xs px-3 py-2 rounded-lg border border-border text-grey hover:text-white hover:border-primary/40 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Layout: sidebar + content */}
      <div className="pt-16 flex">
        {/* Sidebar */}
        <aside className="hidden md:block w-60 shrink-0 border-r border-border bg-surface/40 min-h-[calc(100vh-4rem)]">
          <nav className="sticky top-16 p-3 space-y-1">
            {NAV_ITEMS.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/admin/knowledge-base" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    active
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-grey hover:text-white hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Mobile nav */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 glass border-t border-border">
          <nav className="flex overflow-x-auto px-2 py-2 gap-1">
            {NAV_ITEMS.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/admin/knowledge-base" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`shrink-0 px-3 py-2 rounded-lg text-xs whitespace-nowrap transition-colors ${
                    active ? "bg-primary/10 text-primary" : "text-grey hover:text-white"
                  }`}
                >
                  {item.icon} {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Main content */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8">
          {children}
        </main>
      </div>
    </div>
  );
}
