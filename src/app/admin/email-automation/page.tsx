import { db } from "@/db";
import { emailQueue, communications } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

const statusColor = (s: string) =>
  s === "sent" ? "bg-green-500/15 text-green-400 border-green-500/30"
  : s === "pending" ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
  : s === "failed" ? "bg-red-500/15 text-red-400 border-red-500/30"
  : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";

export default async function EmailAutomationPage() {
  const queue = await db.select().from(emailQueue).orderBy(desc(emailQueue.scheduledFor)).limit(50);
  const sent = await db.select().from(communications)
    .where((comms) => undefined) // select all; filter in JS for channel
    .orderBy(desc(communications.createdAt)).limit(80);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-[var(--font-heading)] text-2xl font-semibold text-white">Email Automation</h1>
          <p className="mt-1 text-sm text-grey">
            Real outbound engine: queued emails, processed by the email worker, delivered via Resend.
          </p>
        </div>
        <a href="/admin/email-templates" className="rounded-lg border border-primary/40 px-4 py-2 text-sm text-primary hover:bg-primary/10">
          Manage templates →
        </a>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-grey">
          📥 Queue ({queue.length})
        </h2>
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-grey-dark">
                <th className="p-3">Type</th><th className="p-3">Scheduled</th><th className="p-3">Status</th><th className="p-3">Template data</th>
              </tr>
            </thead>
            <tbody>
              {queue.length === 0 && (
                <tr><td colSpan={4} className="p-6 text-grey">Queue is empty — nothing scheduled.</td></tr>
              )}
              {queue.map((q) => (
                <tr key={q.id} className="border-b border-border/60 last:border-0">
                  <td className="p-3 text-white">{q.emailType}</td>
                  <td className="p-3 text-grey">
                    {q.scheduledFor ? new Date(q.scheduledFor).toLocaleString("en-IN") : "—"}
                  </td>
                  <td className="p-3">
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${statusColor(q.status || "pending")}`}>{q.status}</span>
                  </td>
                  <td className="max-w-md p-3 text-grey">
                    <code className="text-xs">{JSON.stringify(q.templateData || {}).slice(0, 120)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-grey">
          🗂️ Recent communications ({sent.length})
        </h2>
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-grey-dark">
                <th className="p-3">Channel</th><th className="p-3">Subject</th><th className="p-3">To</th><th className="p-3">Status</th><th className="p-3">When</th>
              </tr>
            </thead>
            <tbody>
              {sent.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-grey">No communications recorded yet.</td></tr>
              )}
              {sent.map((c) => (
                <tr key={c.id} className="border-b border-border/60 last:border-0">
                  <td className="p-3 text-grey">{c.channel}</td>
                  <td className="max-w-xs p-3 text-white"><div className="truncate">{c.subject || "—"}</div></td>
                  <td className="p-3 text-grey">{c.toEmail || "—"}</td>
                  <td className="p-3"><span className={`rounded-full border px-2 py-0.5 text-xs ${statusColor(c.status || "sent")}`}>{c.status}</span></td>
                  <td className="p-3 text-grey-dark">{c.createdAt ? new Date(c.createdAt).toLocaleString("en-IN") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
