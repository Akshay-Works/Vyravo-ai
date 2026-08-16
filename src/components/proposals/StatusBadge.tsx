"use client";

const STYLES: Record<string, string> = {
  draft: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  in_review: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  approved: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  sent: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  viewed: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
  accepted: "bg-green-500/10 text-green-400 border-green-500/30",
  rejected: "bg-red-500/10 text-red-400 border-red-500/30",
  changes_requested: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  expired: "bg-gray-500/10 text-gray-400 border-gray-500/30",
  archived: "bg-gray-600/10 text-gray-500 border-gray-600/30",
};

const LABELS: Record<string, string> = {
  draft: "Draft",
  in_review: "In Review",
  approved: "Approved",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  rejected: "Rejected",
  changes_requested: "Changes Requested",
  expired: "Expired",
  archived: "Archived",
};

export function ProposalStatusBadge({ status }: { status: string }) {
  const style = STYLES[status] || STYLES.draft;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-medium capitalize ${style}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {LABELS[status] || status}
    </span>
  );
}
