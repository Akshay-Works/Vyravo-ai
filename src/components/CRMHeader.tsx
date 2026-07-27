"use client";

import { useState } from "react";
import Link from "next/link";

export function CRMHeader() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between h-16 px-4 md:px-6 lg:px-8 border-b border-border bg-surface/80 backdrop-blur-sm">
      {/* Mobile Menu Toggle */}
      <button
        className="lg:hidden p-2 text-grey hover:text-white"
        onClick={() => setShowMobileMenu(!showMobileMenu)}
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Search */}
      <div className="flex-1 max-w-xl mx-4">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-grey-dark"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search leads, clients, projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-bg border border-border rounded-lg text-white placeholder-grey-dark focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
          />
          <kbd className="hidden sm:inline-flex absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 text-xs text-grey-dark bg-surface border border-border rounded">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2">
        {/* Quick Add */}
        <div className="relative group">
          <button className="p-2 text-grey hover:text-white hover:bg-white/5 rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </button>
          <div className="absolute right-0 top-full mt-1 w-48 py-2 bg-surface border border-border rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
            <Link href="/crm/leads/new" className="flex items-center gap-2 px-4 py-2 text-sm text-grey hover:text-white hover:bg-white/5">
              <span>➕</span> New Lead
            </Link>
            <Link href="/crm/tasks/new" className="flex items-center gap-2 px-4 py-2 text-sm text-grey hover:text-white hover:bg-white/5">
              <span>✓</span> New Task
            </Link>
            <Link href="/crm/meetings/new" className="flex items-center gap-2 px-4 py-2 text-sm text-grey hover:text-white hover:bg-white/5">
              <span>📅</span> New Meeting
            </Link>
          </div>
        </div>

        {/* Notifications */}
        <button className="relative p-2 text-grey hover:text-white hover:bg-white/5 rounded-lg transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
        </button>

        {/* User Menu */}
        <div className="relative group">
          <button className="flex items-center gap-2 p-1.5 hover:bg-white/5 rounded-lg transition-colors">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold">
              A
            </div>
          </button>
          <div className="absolute right-0 top-full mt-1 w-48 py-2 bg-surface border border-border rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
            <div className="px-4 py-2 border-b border-border">
              <p className="text-sm font-medium text-white">Admin</p>
              <p className="text-xs text-grey">admin@vyravo.ai</p>
            </div>
            <Link href="/crm/settings" className="flex items-center gap-2 px-4 py-2 text-sm text-grey hover:text-white hover:bg-white/5">
              Settings
            </Link>
            <Link href="/" className="flex items-center gap-2 px-4 py-2 text-sm text-grey hover:text-white hover:bg-white/5">
              Back to Website
            </Link>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Overlay */}
      {showMobileMenu && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowMobileMenu(false)} />
          <div className="fixed inset-y-0 left-0 w-64 bg-surface border-r border-border p-4">
            <div className="flex items-center justify-between mb-6">
              <span className="text-lg font-semibold">Menu</span>
              <button onClick={() => setShowMobileMenu(false)} className="text-grey hover:text-white">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="space-y-1">
              {[
                { name: "Dashboard", href: "/crm" },
                { name: "Leads", href: "/crm/leads" },
                { name: "Pipeline", href: "/crm/pipeline" },
                { name: "Clients", href: "/crm/clients" },
                { name: "Projects", href: "/crm/projects" },
                { name: "Tasks", href: "/crm/tasks" },
                { name: "Meetings", href: "/crm/meetings" },
                { name: "Analytics", href: "/crm/analytics" },
              ].map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setShowMobileMenu(false)}
                  className="block px-3 py-2 text-sm text-grey hover:text-white hover:bg-white/5 rounded-lg"
                >
                  {item.name}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
