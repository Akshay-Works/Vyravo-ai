"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Logo } from "./Logo";
import { NAV_LINKS, APP_LINKS, SITE_LINKS } from "@/lib/constants";

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "glass shadow-lg shadow-black/20"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          <Logo />

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1" aria-label="Main navigation">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-3 py-2 text-sm text-grey hover:text-white transition-colors rounded-lg hover:bg-white/5"
              >
                {link.label}
              </Link>
            ))}

            {/* Live Apps dropdown */}
            <div className="relative group">
              <button className="flex items-center gap-1 px-3 py-2 text-sm text-grey hover:text-white transition-colors rounded-lg hover:bg-white/5">
                Live Apps
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div className="absolute left-1/2 -translate-x-1/2 top-full pt-2 w-72 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <div className="glass border border-border rounded-xl p-2 shadow-xl shadow-black/30 space-y-1">
                  {APP_LINKS.map((app) => (
                    <a
                      key={app.href}
                      href={app.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      <span className="flex items-center gap-1.5 text-sm text-white font-medium">
                        {app.label}
                        <svg className="w-3 h-3 text-grey" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </span>
                      <span className="block text-xs text-grey mt-0.5">{app.description}</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </nav>

          <div className="hidden lg:flex items-center gap-3">
            <a
              href={SITE_LINKS.discoveryCall}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary text-sm"
            >
              Book Discovery Call
            </a>
          </div>

          {/* Mobile toggle */}
          <button
            className="lg:hidden p-2 text-grey hover:text-white transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden glass border-t border-border">
          <nav className="max-w-7xl mx-auto px-4 py-4 space-y-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block px-4 py-3 text-sm text-grey hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-grey-dark">
              Live Apps
            </p>
            {APP_LINKS.map((app) => (
              <a
                key={app.href}
                href={app.href}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-4 py-3 text-sm text-grey hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                onClick={() => setMobileOpen(false)}
              >
                {app.label} ↗
              </a>
            ))}
            <div className="pt-3 border-t border-border">
              <a
                href={SITE_LINKS.discoveryCall}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary w-full justify-center text-sm"
                onClick={() => setMobileOpen(false)}
              >
                Book Discovery Call
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
