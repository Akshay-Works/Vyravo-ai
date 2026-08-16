"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

export default function PortalProjectDetailPage() {
  const { id } = useParams();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/projects/${id}`);
      const d = await res.json();
      if (d.project) setProject(d.project);
    } catch {} finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="animate-pulse h-64 rounded-xl bg-surface border border-border" />;
  if (!project) return <div className="rounded-xl border border-border bg-surface p-8 text-center text-grey">Project not found.</div>;

  const milestones: any[] = Array.isArray(project.milestones) ? project.milestones : [];

  return (
    <div className="space-y-6">
      <div><Link href="/portal/projects" className="text-xs text-grey hover:text-white">← Projects</Link>
        <h1 className="text-3xl font-semibold font-[var(--font-heading)] mt-1">{project.name}</h1>
        <p className="text-sm text-grey mt-2">{project.description}</p>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-surface p-5"><p className="text-xs text-grey-dark">Status</p><p className="mt-1 text-lg font-semibold capitalize">{project.status || "planning"}</p></div>
        <div className="rounded-xl border border-border bg-surface p-5"><p className="text-xs text-grey-dark">Progress</p><p className="mt-1 text-lg font-semibold">{project.progress || 0}%</p></div>
        <div className="rounded-xl border border-border bg-surface p-5"><p className="text-xs text-grey-dark">Timeline</p><p className="mt-1 text-sm text-grey">{project.startDate ? new Date(project.startDate).toLocaleDateString() : "—"} → {project.dueDate ? new Date(project.dueDate).toLocaleDateString() : "—"}</p></div>
      </div>
      <div className="w-full h-3 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${project.progress || 0}%` }} />
      </div>
      {milestones.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-4">Milestones</h2>
          <div className="space-y-4">
            {milestones.map((m: any, i: number) => (
              <div key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-5 h-5 rounded-full border-2 ${m.status === "completed" ? "bg-green-500 border-green-500" : m.status === "in_progress" ? "bg-primary border-primary" : "border-border"}`} />
                  {i < milestones.length - 1 && <div className="w-0.5 flex-1 bg-border my-1" />}
                </div>
                <div className="pb-6">
                  <p className="font-medium">{m.title || m.name}</p>
                  {m.description && <p className="text-sm text-grey">{m.description}</p>}
                  <p className={`text-xs mt-1 ${m.status === "completed" ? "text-green-400" : m.status === "in_progress" ? "text-primary" : "text-grey-dark"}`}>
                    {m.status === "completed" ? `Completed ${m.completionDate ? new Date(m.completionDate).toLocaleDateString() : ""}` : m.status === "in_progress" ? "In Progress" : "Pending"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
