"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PLATFORMS = ["linkedin", "instagram", "x", "facebook", "youtube"];
const TYPES = ["post", "reel", "story", "carousel", "video", "article"];

export default function SocialPostForm({ post, admin }: { post: any | null; admin: boolean }) {
  const router = useRouter();
  const [platform, setPlatform] = useState(post?.platform || "linkedin");
  const [contentType, setContentType] = useState(post?.content_type || "post");
  const [caption, setCaption] = useState(post?.caption || "");
  const [media, setMedia] = useState<string>((post?.media_urls || []).join("\n"));
  const [hashtags, setHashtags] = useState(post?.hashtags || "");
  const [scheduledAt, setScheduledAt] = useState(post?.scheduled_at ? new Date(post.scheduled_at).toISOString().slice(0, 16) : "");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const input = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white";

  const run = async (fn: () => Promise<Response>, okMsg: string, go?: string) => {
    if (busy) return;
    setBusy(true); setMsg("");
    try {
      const r = await fn();
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "failed");
      setMsg("✅ " + okMsg);
      if (go) router.push(go);
      else router.refresh();
    } catch (e: any) { setMsg("❌ " + (e.message || "failed")); }
    setBusy(false);
  };

  const body = {
    platform, contentType, caption,
    mediaUrls: media.split("\n").map((s) => s.trim()).filter(Boolean),
    hashtags, scheduledAt: scheduledAt || null,
  };

  const save = (after?: string) => run(
    () => post
      ? fetch(`/api/social/posts/${post.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      : fetch("/api/social/posts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    "saved", after);

  const transition = (to: string, after = "/social/calendar") => run(
    () => fetch(`/api/social/posts/${post.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "transition", to, note }) }),
    `moved to ${to.replace(/_/g, " ")}`, after);

  const remove = () => {
    if (!confirm("Delete this post?")) return;
    run(() => fetch(`/api/social/posts/${post.id}`, { method: "DELETE" }), "deleted", "/social/calendar");
  };

  const st = post?.status || "draft";
  const editable = !post || admin || ["draft", "review"].includes(st);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
      {post && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-surface-2 px-2.5 py-1 font-bold">{st.replace(/_/g, " ")}</span>
          {post.needs_approval && <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-amber-400">needs admin approval</span>}
          {post.review_note && <span className="w-full rounded-lg bg-surface-2 p-2 text-grey">📝 {post.review_note}</span>}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} disabled={!editable} className={input}>
          {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={contentType} onChange={(e) => setContentType(e.target.value)} disabled={!editable} className={input}>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <textarea value={caption} onChange={(e) => setCaption(e.target.value)} disabled={!editable}
        placeholder="Caption / script…" rows={6} className={input} />
      <textarea value={media} onChange={(e) => setMedia(e.target.value)} disabled={!editable}
        placeholder="Media URLs (one per line)" rows={2} className={input} />
      <input value={hashtags} onChange={(e) => setHashtags(e.target.value)} disabled={!editable} placeholder="#hashtags" className={input} />
      <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} disabled={!editable} className={input} />

      {editable && (
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={() => save()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {post ? "Save changes" : "Save draft"}
          </button>
          {!post && <button disabled={busy} onClick={() => save("/social/calendar")} className="rounded-lg bg-surface-2 px-4 py-2 text-sm disabled:opacity-50">Save & view calendar</button>}
          {post && (admin || ["draft", "review"].includes(st)) && (
            <button disabled={busy} onClick={remove} className="rounded-lg bg-surface-2 px-4 py-2 text-sm text-red-400 disabled:opacity-50">Delete</button>
          )}
        </div>
      )}

      {post && (
        <div className="border-t border-border pt-3">
          <p className="mb-2 text-xs font-semibold text-grey">Workflow</p>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for reviewer / feedback (optional)" className={input} />
          <div className="mt-2 flex flex-wrap gap-2">
            {["draft", "review"].includes(st) && (
              <button disabled={busy} onClick={() => transition(st === "draft" ? "review" : "pending_approval", undefined)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold disabled:opacity-50">
                {st === "draft" ? "→ Send for review" : "→ Submit for approval"}
              </button>
            )}
            {["draft", "review"].includes(st) && st === "draft" && (
              <button disabled={busy} onClick={() => transition("pending_approval", undefined)}
                className="rounded-lg bg-surface-2 px-4 py-2 text-sm disabled:opacity-50">Submit directly for approval</button>
            )}
            {admin && ["review", "pending_approval"].includes(st) && (
              <>
                <button disabled={busy} onClick={() => transition("approved", undefined)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold disabled:opacity-50">✅ Approve</button>
                <button disabled={busy} onClick={() => transition("rejected", undefined)} className="rounded-lg bg-surface-2 px-4 py-2 text-sm text-red-400 disabled:opacity-50">❌ Reject + feedback</button>
                <button disabled={busy} onClick={() => transition("draft", undefined)} className="rounded-lg bg-surface-2 px-4 py-2 text-sm disabled:opacity-50">↩ Send back to draft</button>
              </>
            )}
            {(admin || (!post.needs_approval || st === "approved")) && ["approved", "scheduled"].includes(st) && (
              <>
                {st === "approved" && <button disabled={busy} onClick={() => transition("scheduled", undefined)} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold disabled:opacity-50">📅 Schedule</button>}
                <button disabled={busy} onClick={() => transition("published", undefined)} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold disabled:opacity-50">🚀 Mark published</button>
              </>
            )}
            {admin && <button disabled={busy} onClick={() => transition("archived")} className="rounded-lg bg-surface-2 px-4 py-2 text-sm disabled:opacity-50">🗄 Archive</button>}
          </div>
          {!admin && post.needs_approval && !["approved", "scheduled", "published"].includes(st) && (
            <p className="mt-2 text-[11px] text-amber-400">🔒 Publish unlocks after admin approval.</p>
          )}
        </div>
      )}
      {msg && <p className="text-xs">{msg}</p>}
    </div>
  );
}
