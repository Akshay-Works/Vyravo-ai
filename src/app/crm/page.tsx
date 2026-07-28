export const metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold font-[var(--font-heading)]">Settings</h1>
        <p className="text-sm text-grey mt-1">Manage your CRM configuration</p>
      </div>

      {/* General Settings */}
      <div className="rounded-xl border border-border bg-surface p-5 md:p-6">
        <h2 className="text-lg font-semibold mb-4">General</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Company Name</label>
            <input
              type="text"
              defaultValue="Vyravo AI"
              className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Default Currency</label>
            <select className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-primary">
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="INR">INR (₹)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Timezone</label>
            <select className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-primary">
              <option value="UTC">UTC</option>
              <option value="America/New_York">Eastern Time</option>
              <option value="America/Los_Angeles">Pacific Time</option>
              <option value="Asia/Kolkata">India Standard Time</option>
            </select>
          </div>
        </div>
      </div>

      {/* Integrations */}
      <div className="rounded-xl border border-border bg-surface p-5 md:p-6">
        <h2 className="text-lg font-semibold mb-4">Integrations</h2>
        <div className="space-y-3">
          {[
            { name: "Google Calendar", icon: "📅", connected: false },
            { name: "Slack", icon: "💬", connected: false },
            { name: "Calendly", icon: "🗓️", connected: false },
            { name: "HubSpot", icon: "🔶", connected: false },
            { name: "Zapier", icon: "⚡", connected: false },
          ].map((integration) => (
            <div key={integration.name} className="flex items-center justify-between p-3 rounded-lg border border-border">
              <div className="flex items-center gap-3">
                <span className="text-xl">{integration.icon}</span>
                <span className="text-sm font-medium">{integration.name}</span>
              </div>
              <button className="text-sm text-primary hover:underline">
                {integration.connected ? "Disconnect" : "Connect"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Notifications */}
      <div className="rounded-xl border border-border bg-surface p-5 md:p-6">
        <h2 className="text-lg font-semibold mb-4">Notifications</h2>
        <div className="space-y-3">
          {[
            { label: "New lead notifications", enabled: true },
            { label: "Meeting reminders", enabled: true },
            { label: "Task due reminders", enabled: true },
            { label: "Proposal viewed notifications", enabled: false },
            { label: "Invoice paid notifications", enabled: true },
          ].map((setting) => (
            <div key={setting.label} className="flex items-center justify-between p-3 rounded-lg border border-border">
              <span className="text-sm">{setting.label}</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  defaultChecked={setting.enabled}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-surface-2 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button className="btn-primary text-sm">Save Changes</button>
      </div>
    </div>
  );
}
