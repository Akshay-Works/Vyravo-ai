import Link from "next/link";

export const metadata = {
  title: "Clients",
};

export default function ClientsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold font-[var(--font-heading)]">Clients</h1>
          <p className="text-sm text-grey mt-1">Manage your client relationships</p>
        </div>
        <button className="btn-primary text-sm">+ New Client</button>
      </div>

      <div className="rounded-xl border border-border bg-surface p-12 text-center">
        <div className="text-5xl mb-4">🏢</div>
        <h3 className="text-lg font-semibold mb-2">No Clients Yet</h3>
        <p className="text-sm text-grey mb-4 max-w-md mx-auto">
          Convert leads to clients when they sign a contract. Clients will appear here with their full history.
        </p>
        <Link href="/crm/leads" className="btn-secondary text-sm">
          View Leads →
        </Link>
      </div>
    </div>
  );
}
