import Link from "next/link";

export const metadata = {
  title: "Meetings",
};

export default function MeetingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold font-[var(--font-heading)]">Meetings</h1>
          <p className="text-sm text-grey mt-1">View and manage all your scheduled meetings</p>
        </div>
        <button className="btn-primary text-sm">+ Schedule Meeting</button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Today */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="text-lg font-semibold mb-4">Today</h3>
          <div className="text-center py-8 text-grey">
            <p className="text-sm">No meetings scheduled for today</p>
          </div>
        </div>

        {/* Upcoming */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="text-lg font-semibold mb-4">Upcoming</h3>
          <div className="text-center py-8 text-grey">
            <p className="text-sm">No upcoming meetings</p>
            <Link href="/book-discovery-call" className="text-primary text-sm hover:underline mt-2 inline-block">
              Schedule a discovery call →
            </Link>
          </div>
        </div>
      </div>

      {/* Calendar Integration */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="text-lg font-semibold mb-4">Calendar Integration</h3>
        <p className="text-sm text-grey mb-4">Connect your calendar to sync meetings automatically.</p>
        <div className="flex flex-wrap gap-3">
          <button className="px-4 py-2 text-sm rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors">
            📅 Connect Google Calendar
          </button>
          <button className="px-4 py-2 text-sm rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors">
            📘 Connect Outlook
          </button>
          <button className="px-4 py-2 text-sm rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors">
            🗓️ Connect Calendly
          </button>
        </div>
      </div>
    </div>
  );
}
