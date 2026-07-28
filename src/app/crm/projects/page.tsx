import Link from "next/link";

export const metadata = {
  title: "Projects",
};

export default function ProjectsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold font-[var(--font-heading)]">Projects</h1>
          <p className="text-sm text-grey mt-1">Track all your active projects</p>
        </div>
        <button className="btn-primary text-sm">+ New Project</button>
      </div>

      <div className="rounded-xl border border-border bg-surface p-12 text-center">
        <div className="text-5xl mb-4">📁</div>
        <h3 className="text-lg font-semibold mb-2">No Projects Yet</h3>
        <p className="text-sm text-grey mb-4 max-w-md mx-auto">
          Create projects for your clients to track deliverables, timelines, and progress.
        </p>
        <Link href="/crm/clients" className="btn-secondary text-sm">
          View Clients →
        </Link>
      </div>
    </div>
  );
}
