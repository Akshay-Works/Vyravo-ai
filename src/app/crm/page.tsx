export const metadata = {
  title: "Proposals",
};

export default function ProposalsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold font-[var(--font-heading)]">Proposals</h1>
          <p className="text-sm text-grey mt-1">Create and track client proposals</p>
        </div>
        <button className="btn-primary text-sm">+ New Proposal</button>
      </div>

      <div className="grid sm:grid-cols-4 gap-4">
        {[
          { label: "Draft", count: 0, color: "grey" },
          { label: "Sent", count: 0, color: "blue" },
          { label: "Accepted", count: 0, color: "green" },
          { label: "Rejected", count: 0, color: "red" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-surface p-4 text-center">
            <p className="text-2xl font-semibold">{stat.count}</p>
            <p className="text-sm text-grey">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-surface p-12 text-center">
        <div className="text-5xl mb-4">📄</div>
        <h3 className="text-lg font-semibold mb-2">No Proposals Yet</h3>
        <p className="text-sm text-grey mb-4 max-w-md mx-auto">
          Create professional proposals for your leads and clients. Track views, acceptance, and signatures.
        </p>
        <button className="btn-primary text-sm">Create First Proposal</button>
      </div>
    </div>
  );
}
