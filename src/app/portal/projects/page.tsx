"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function PortalProjectsPage() {
  const [projects, setProjs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/portal/projects").then((r) => r.json()).then((d) => setProjs(d.projects || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse h-40 rounded-xl bg-surface border border-border" />;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold font-[var(--font-heading)]">Your <span className="gradient-text">Projects</span></h1>
      {projects.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-12 text-center"><p className="text-4xl mb-4">📋</p><p className="text-grey">No projects yet.</p></div>
      ) : (
        <div className="grid gap-4">
          {projects.map((p: any) => (
            <Link key={p.id} href={`/portal/projects/${p.id}`} className="rounded-xl border border-border bg-surface p-5 card-hover">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold font-[var(--font-heading)]">{p.name}</h3>
                  <p className="text-sm text-grey mt-1">{p.description?.slice(0, 120)}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs capitalize px-2.5 py-0.5 rounded-full border text-grey border-border">{p.status || "planning"}</span>
                  <p className="text-xs text-grey-dark mt-2">{p.progress || 0}% complete</p>
                </div>
              </div>
              <div className="mt-3 w-full h-2 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${p.progress || 0}%` }} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
