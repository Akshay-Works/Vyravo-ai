export const metadata = {
  title: "Analytics",
};

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold font-[var(--font-heading)]">Analytics</h1>
        <p className="text-sm text-grey mt-1">Track performance and insights</p>
      </div>

      {/* Key Metrics */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Revenue", value: "$0", change: "+0%", icon: "💰" },
          { label: "Pipeline Value", value: "$0", change: "+0%", icon: "📊" },
          { label: "Conversion Rate", value: "0%", change: "+0%", icon: "📈" },
          { label: "Avg Deal Size", value: "$0", change: "+0%", icon: "💎" },
        ].map((metric) => (
          <div key={metric.label} className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{metric.icon}</span>
              <span className="text-xs text-green-400">{metric.change}</span>
            </div>
            <p className="text-2xl font-semibold">{metric.value}</p>
            <p className="text-sm text-grey mt-1">{metric.label}</p>
          </div>
        ))}
      </div>

      {/* Charts Placeholder */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="text-lg font-semibold mb-4">Revenue Over Time</h3>
          <div className="h-64 flex items-center justify-center text-grey">
            <div className="text-center">
              <p className="text-sm">No data available yet</p>
              <p className="text-xs mt-1">Start closing deals to see trends</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="text-lg font-semibold mb-4">Lead Sources</h3>
          <div className="h-64 flex items-center justify-center text-grey">
            <div className="text-center">
              <p className="text-sm">No data available yet</p>
              <p className="text-xs mt-1">Add leads to see source breakdown</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="text-lg font-semibold mb-4">Pipeline by Stage</h3>
          <div className="h-64 flex items-center justify-center text-grey">
            <div className="text-center">
              <p className="text-sm">No data available yet</p>
              <p className="text-xs mt-1">Add leads to your pipeline</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="text-lg font-semibold mb-4">Industry Breakdown</h3>
          <div className="h-64 flex items-center justify-center text-grey">
            <div className="text-center">
              <p className="text-sm">No data available yet</p>
              <p className="text-xs mt-1">Add leads with industry info</p>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Stats */}
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          { label: "Avg Sales Cycle", value: "— days" },
          { label: "Proposal Win Rate", value: "0%" },
          { label: "Client Retention", value: "0%" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-surface p-5 text-center">
            <p className="text-2xl font-semibold">{stat.value}</p>
            <p className="text-sm text-grey mt-1">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
