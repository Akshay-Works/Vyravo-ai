"use client";

import { useEffect, useState } from "react";

export default function PortalFilesPage() {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/portal/files").then((r) => r.json()).then((d) => setFiles(d.files || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse h-40 rounded-xl bg-surface border border-border" />;

  const humanSize = (b: number) => b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : b > 1024 ? `${(b / 1024).toFixed(1)} KB` : `${b} B`;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold font-[var(--font-heading)]">Your <span className="gradient-text">Files</span></h1>
      {files.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-12 text-center"><p className="text-4xl mb-4">📁</p><p className="text-grey">No files shared yet. Uploaded files will appear here.</p></div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-grey-dark border-b border-border">
              <th className="px-6 py-4 font-medium">Name</th><th className="px-6 py-4 font-medium">Type</th><th className="px-6 py-4 font-medium">Size</th><th className="px-6 py-4 font-medium">Date</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {files.map((f: any) => (
                <tr key={f.id} className="hover:bg-white/[0.02]">
                  <td className="px-6 py-4 text-grey">{f.originalName || f.name}</td>
                  <td className="px-6 py-4 text-grey-dark">{f.mimeType?.split("/").pop() || "—"}</td>
                  <td className="px-6 py-4 text-grey-dark">{f.sizeBytes ? humanSize(f.sizeBytes) : "—"}</td>
                  <td className="px-6 py-4 text-grey-dark">{new Date(f.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
