"use client";

// Status badge
export function KBStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    review: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    approved: "bg-green-500/10 text-green-400 border-green-500/30",
    published: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    archived: "bg-gray-500/10 text-gray-400 border-gray-500/30",
  };
  const style = styles[status] || styles.draft;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-medium capitalize ${style}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {status}
    </span>
  );
}

// Access level badge
export function KBAccessBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    public: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    internal: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
    confidential: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    "client-specific": "bg-pink-500/10 text-pink-400 border-pink-500/30",
    restricted: "bg-red-500/10 text-red-400 border-red-500/30",
  };
  const style = styles[level] || styles.internal;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-medium ${style}`}>
      {level}
    </span>
  );
}

// Processing status badge
export function KBProcessBadge({ status }: { status: string | null }) {
  const styles: Record<string, string> = {
    ready: "bg-green-500/10 text-green-400 border-green-500/30",
    processing: "bg-blue-500/10 text-blue-400 border-blue-500/30 animate-pulse",
    indexing: "bg-blue-500/10 text-blue-400 border-blue-500/30 animate-pulse",
    uploading: "bg-blue-500/10 text-blue-400 border-blue-500/30 animate-pulse",
    pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    failed: "bg-red-500/10 text-red-400 border-red-500/30",
  };
  const style = styles[status || "pending"] || styles.pending;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-medium capitalize ${style}`}>
      {status || "pending"}
    </span>
  );
}

// Category badge
export function KBCategoryBadge({ name, icon }: { name?: string | null; icon?: string | null }) {
  if (!name) return <span className="text-xs text-grey-dark">Uncategorized</span>;
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-border bg-white/5 text-xs text-grey">
      {icon && <span className="text-xs">{icon}</span>}
      {name}
    </span>
  );
}
