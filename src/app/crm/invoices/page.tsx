export const metadata = {
  title: "Invoices",
};

export default function InvoicesPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold font-[var(--font-heading)]">Invoices</h1>
          <p className="text-sm text-grey mt-1">Manage billing and payments</p>
        </div>
        <button className="btn-primary text-sm">+ New Invoice</button>
      </div>

      <div className="grid sm:grid-cols-4 gap-4">
        {[
          { label: "Draft", count: 0, amount: "$0", color: "grey" },
          { label: "Sent", count: 0, amount: "$0", color: "blue" },
          { label: "Paid", count: 0, amount: "$0", color: "green" },
          { label: "Overdue", count: 0, amount: "$0", color: "red" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-grey">{stat.label}</p>
              <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2">{stat.count}</span>
            </div>
            <p className="text-xl font-semibold">{stat.amount}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-surface p-12 text-center">
        <div className="text-5xl mb-4">💰</div>
        <h3 className="text-lg font-semibold mb-2">No Invoices Yet</h3>
        <p className="text-sm text-grey mb-4 max-w-md mx-auto">
          Create and send professional invoices to your clients. Track payments and automate reminders.
        </p>
        <button className="btn-primary text-sm">Create First Invoice</button>
      </div>
    </div>
  );
}
