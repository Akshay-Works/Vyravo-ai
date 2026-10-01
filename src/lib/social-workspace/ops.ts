// ============================================================================
// SOCIAL WORKSPACE — content, calendar, tasks, assets, analytics.
// Social role: drafts + submits; PUBLISH/APPROVE of needs_approval content is
// admin-only (enforced here, not in the UI). No CRM, no finance, no secrets.
// ============================================================================
import { pool } from "@/db";
import { ensureRbacSchema, audit, notify, type CurrentUser } from "@/lib/auth/rbac";

export const POST_STATUSES = ["draft", "review", "pending_approval", "approved", "scheduled", "published", "archived"] as const;

export async function getSocialOverview(u: CurrentUser): Promise<any> {
  await ensureRbacSchema();
  const admin = u.role === "admin";
  const args = admin ? [] : [u.id];
  const mine = admin ? "" : "AND author_id = $1";
  const one = async (sql: string) => (await pool.query(sql, args)).rows[0] || {};
  const posts = await one(`SELECT count(*)::int AS total,
    count(*) FILTER (WHERE status = 'draft')::int AS drafts,
    count(*) FILTER (WHERE status = 'pending_approval')::int AS pending,
    count(*) FILTER (WHERE status = 'scheduled')::int AS scheduled,
    count(*) FILTER (WHERE status = 'published')::int AS published FROM content_posts WHERE 1=1 ${mine}`);
  const tasks = await pool.query(
    `SELECT count(*) FILTER (WHERE status <> 'done')::int AS open,
            count(*) FILTER (WHERE status <> 'done' AND due_at < now())::int AS overdue
     FROM content_tasks ${admin ? "" : "WHERE assignee_id = $1"}`, args);
  const m = await pool.query(
    `SELECT platform, followers, reach, engagement FROM social_metrics ORDER BY date DESC LIMIT 10`);
  return { posts, tasks: tasks.rows[0], metrics: m.rows };
}

export async function listPosts(u: CurrentUser, opts: { status?: string; platform?: string } = {}): Promise<any[]> {
  const conds: string[] = [];
  const args: any[] = [];
  if (u.role !== "admin") { args.push(u.id); conds.push(`p.author_id = $${args.length}`); }
  if (opts.status) { args.push(opts.status); conds.push(`p.status = $${args.length}`); }
  if (opts.platform) { args.push(opts.platform); conds.push(`p.platform = $${args.length}`); }
  const r = await pool.query(
    `SELECT p.*, a.name AS author_name, r2.name AS reviewer_name
     FROM content_posts p LEFT JOIN kb_users a ON a.id = p.author_id LEFT JOIN kb_users r2 ON r2.id = p.reviewer_id
     ${conds.length ? "WHERE " + conds.join(" AND ") : ""}
     ORDER BY COALESCE(p.scheduled_at, p.updated_at) DESC LIMIT 200`, args);
  return r.rows;
}

export async function getPost(u: CurrentUser, id: number): Promise<any | null> {
  const r = await pool.query(`SELECT p.*, a.name AS author_name FROM content_posts p
    LEFT JOIN kb_users a ON a.id = p.author_id WHERE p.id = $1`, [id]);
  if ((r.rowCount ?? 0) === 0) return null;
  const p = r.rows[0];
  if (u.role !== "admin" && Number(p.author_id) !== u.id) return null;
  return p;
}

export async function createPost(u: CurrentUser, input: {
  platform?: string; contentType?: string; caption?: string; mediaUrls?: string[];
  hashtags?: string; scheduledAt?: string | null; notes?: string;
}): Promise<{ id: number }> {
  await ensureRbacSchema();
  const ins = await pool.query(
    `INSERT INTO content_posts (platform, content_type, caption, media_urls, hashtags, scheduled_at, status, author_id, review_note)
     VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8) RETURNING id`,
    [(input.platform || "linkedin").slice(0, 30), (input.contentType || "post").slice(0, 30),
     (input.caption || "").slice(0, 8000), JSON.stringify((input.mediaUrls || []).slice(0, 10)),
     (input.hashtags || "").slice(0, 500), input.scheduledAt || null, u.id, (input.notes || "").slice(0, 1000)]);
  await audit({ userId: u.id, role: u.role, action: "social.post_created", object: "post", objectId: ins.rows[0].id });
  return { id: Number(ins.rows[0].id) };
}

export async function updatePost(u: CurrentUser, id: number, input: {
  platform?: string; contentType?: string; caption?: string; mediaUrls?: string[];
  hashtags?: string; scheduledAt?: string | null; notes?: string; needsApproval?: boolean;
}): Promise<void> {
  const p = await getPost(u, id);
  if (!p) throw Object.assign(new Error("not found"), { status: 404 });
  if (u.role !== "admin" && !["draft", "review"].includes(p.status))
    throw Object.assign(new Error("only drafts can be edited — ask admin to send it back"), { status: 403 });
  const sets: string[] = [];
  const args: any[] = [id];
  const set = (c: string, v: any) => { args.push(v); sets.push(`${c} = $${args.length}`); };
  if (input.platform !== undefined) set("platform", input.platform.slice(0, 30));
  if (input.contentType !== undefined) set("content_type", input.contentType.slice(0, 30));
  if (input.caption !== undefined) set("caption", input.caption.slice(0, 8000));
  if (input.mediaUrls !== undefined) set("media_urls", JSON.stringify(input.mediaUrls.slice(0, 10)));
  if (input.hashtags !== undefined) set("hashtags", input.hashtags.slice(0, 500));
  if (input.scheduledAt !== undefined) set("scheduled_at", input.scheduledAt);
  if (input.notes !== undefined) set("review_note", input.notes.slice(0, 1000));
  if (input.needsApproval !== undefined && u.role === "admin") set("needs_approval", !!input.needsApproval);
  if (!sets.length) return;
  sets.push("updated_at = now()");
  await pool.query(`UPDATE content_posts SET ${sets.join(", ")} WHERE id = $1`, args);
  await audit({ userId: u.id, role: u.role, action: "social.post_updated", object: "post", objectId: id });
}

/** Workflow transitions — the approval gate lives HERE (server-side). */
export async function transitionPost(u: CurrentUser, id: number, to: string, note?: string): Promise<void> {
  const p = await getPost(u, id);
  if (!p) throw Object.assign(new Error("not found"), { status: 404 });
  const from = p.status;
  const admin = u.role === "admin";
  const ok =
    (to === "review" && from === "draft") ||
    (to === "pending_approval" && ["draft", "review"].includes(from)) ||
    (to === "draft" && admin && ["review", "pending_approval", "approved"].includes(from)) || // send back
    (to === "approved" && admin && ["pending_approval", "review", "draft"].includes(from)) ||
    (to === "rejected" && admin && ["pending_approval", "review"].includes(from)) ||
    (to === "scheduled" && (admin || (!p.needs_approval && from === "draft")) && ["approved", "draft"].includes(from)) ||
    (to === "published" && (admin || (!p.needs_approval || from === "approved")) && ["approved", "scheduled"].includes(from)) ||
    (to === "archived" && admin);
  if (!ok) throw Object.assign(new Error(`transition ${from} → ${to} not permitted`), { status: 403 });
  const status = to === "rejected" ? "draft" : to;
  await pool.query(`UPDATE content_posts SET status = $2, reviewer_id = $3, review_note = $4,
    published_at = CASE WHEN $2 = 'published' THEN COALESCE(published_at, now()) ELSE published_at END,
    updated_at = now() WHERE id = $1`,
    [id, status, admin ? u.id : p.reviewer_id, (note || (to === "rejected" ? "rejected by admin — see feedback" : p.review_note || "")).slice(0, 1000)]);
  await audit({ userId: u.id, role: u.role, action: `social.post_${to}`, object: "post", objectId: id, prev: { from }, next: { to: status } });
  if (to === "pending_approval") {
    const admins = await pool.query(`SELECT id FROM kb_users WHERE is_active = true AND COALESCE(workspace_role,'admin') = 'admin'`);
    for (const a of admins.rows) await notify({ userId: Number(a.id), title: "📝 Content awaiting approval", body: `${p.platform} ${p.content_type} by ${u.name}`, link: "/admin/employees?tab=approvals" });
  }
  if ((to === "approved" || to === "rejected") && p.author_id) {
    await notify({ userId: Number(p.author_id), title: to === "approved" ? "✅ Content approved" : "❌ Content needs changes", body: (note || "").slice(0, 300), link: `/social/calendar` });
  }
  if (to === "published" && p.author_id && Number(p.author_id) !== u.id) {
    await notify({ userId: Number(p.author_id), title: "🚀 Your post was published", body: `${p.platform} ${p.content_type}`, link: "/social/calendar" });
  }
}

export async function deletePost(u: CurrentUser, id: number): Promise<void> {
  const p = await getPost(u, id);
  if (!p) throw Object.assign(new Error("not found"), { status: 404 });
  if (u.role !== "admin" && p.status !== "draft") throw Object.assign(new Error("only drafts can be deleted"), { status: 403 });
  await pool.query(`DELETE FROM content_posts WHERE id = $1`, [id]);
  await audit({ userId: u.id, role: u.role, action: "social.post_deleted", object: "post", objectId: id, prev: { status: p.status } });
}

export async function listContentTasks(u: CurrentUser): Promise<any[]> {
  await ensureRecurringTasks();
  const admin = u.role === "admin";
  const r = await pool.query(
    `SELECT t.*, a.name AS assignee_name FROM content_tasks t LEFT JOIN kb_users a ON a.id = t.assignee_id
     ${admin ? "" : "WHERE t.assignee_id = $1 OR t.assignee_id IS NULL"}
     ORDER BY CASE WHEN t.status <> 'done' THEN 0 ELSE 1 END, t.due_at NULLS LAST LIMIT 200`,
    admin ? [] : [u.id]);
  return r.rows;
}

export async function createContentTask(u: CurrentUser, input: {
  title: string; description?: string; platform?: string; dueAt?: string | null;
  assigneeId?: number | null; recurrence?: string;
}): Promise<{ id: number }> {
  await ensureRbacSchema();
  if (u.role !== "admin") throw Object.assign(new Error("only admin creates tasks"), { status: 403 });
  if (!input.title?.trim()) throw new Error("title required");
  const ins = await pool.query(
    `INSERT INTO content_tasks (title, description, platform, due_at, assignee_id, recurrence, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [input.title.slice(0, 200), (input.description || "").slice(0, 2000), (input.platform || "").slice(0, 30),
     input.dueAt || null, input.assigneeId ?? null, (input.recurrence || "").slice(0, 30), u.id]);
  await audit({ userId: u.id, role: u.role, action: "social.task_created", object: "content_task", objectId: ins.rows[0].id });
  if (input.assigneeId) await notify({ userId: Number(input.assigneeId), title: `📋 New task: ${input.title.slice(0, 80)}`, link: "/social/tasks" });
  if (input.recurrence) await ensureRecurringTasks();
  return { id: Number(ins.rows[0].id) };
}

export async function completeContentTask(u: CurrentUser, id: number): Promise<void> {
  const t = (await pool.query(`SELECT * FROM content_tasks WHERE id = $1`, [id])).rows[0];
  if (!t) throw new Error("task not found");
  if (u.role !== "admin" && t.assignee_id !== null && Number(t.assignee_id) !== u.id)
    throw Object.assign(new Error("not your task"), { status: 403 });
  await pool.query(`UPDATE content_tasks SET status = 'done', done_at = now() WHERE id = $1`, [id]);
  await audit({ userId: u.id, role: u.role, action: "social.task_done", object: "content_task", objectId: id });
}

/**
 * Recurring weekly schedule: a task with recurrence "1,2,3,4,5" (Mon–Fri)
 * spawns dated copies for the next 7 days. Idempotent (title+date dedupe).
 */
export async function ensureRecurringTasks(): Promise<number> {
  await ensureRbacSchema();
  const rec = await pool.query(`SELECT * FROM content_tasks WHERE recurrence <> '' AND status <> 'done'`);
  let made = 0;
  for (const t of rec.rows as any[]) {
    const days = String(t.recurrence).split(",").map((x) => Number(x)).filter((n) => n >= 0 && n <= 6);
    if (!days.length) continue;
    for (let d = 0; d < 7; d++) {
      const dt = new Date();
      dt.setDate(dt.getDate() + d);
      if (!days.includes(dt.getDay())) continue;
      const dayStr = dt.toISOString().slice(0, 10);
      const dup = await pool.query(
        `SELECT 1 FROM content_tasks WHERE title = $1 AND due_at::date = $2::date AND id <> $3 LIMIT 1`,
        [t.title, dayStr, t.id]);
      if ((dup.rowCount ?? 0) > 0) continue;
      const due = new Date(dt); due.setHours(10, 0, 0, 0);
      await pool.query(
        `INSERT INTO content_tasks (title, description, platform, due_at, assignee_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6)`, [t.title, t.description, t.platform, due.toISOString(), t.assignee_id, t.created_by]);
      made++;
    }
  }
  return made;
}

export async function listAssets(): Promise<any[]> {
  const r = await pool.query(`SELECT * FROM social_assets ORDER BY kind, name LIMIT 100`);
  return r.rows;
}

export async function saveAsset(u: CurrentUser, input: { name: string; kind?: string; body?: string }): Promise<{ id: number }> {
  if (u.role !== "admin") throw Object.assign(new Error("only admin manages assets"), { status: 403 });
  if (!input.name?.trim()) throw new Error("name required");
  // No length limits on assets — the column is unbounded text.
  const ins = await pool.query(`INSERT INTO social_assets (name, kind, body, created_by) VALUES ($1,$2,$3,$4) RETURNING id`,
    [input.name.trim(), (input.kind || "info").slice(0, 30), input.body || "", u.id]);
  await audit({ userId: u.id, role: u.role, action: "social.asset_added", object: "asset", objectId: ins.rows[0].id });
  return { id: Number(ins.rows[0].id) };
}

export async function recordMetrics(u: CurrentUser, input: { platform: string; date?: string; followers?: number; reach?: number; engagement?: number; posts?: number }): Promise<void> {
  if (u.role !== "admin") throw Object.assign(new Error("only admin records metrics"), { status: 403 });
  await pool.query(
    `INSERT INTO social_metrics (platform, date, followers, reach, engagement, posts) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (platform, date) DO UPDATE SET followers = $3, reach = $4, engagement = $5, posts = $6`,
    [input.platform.slice(0, 30), input.date || new Date().toISOString().slice(0, 10),
     Math.max(0, Math.round(input.followers || 0)), Math.max(0, Math.round(input.reach || 0)),
     Math.max(0, Math.round(input.engagement || 0)), Math.max(0, Math.round(input.posts || 0))]);
}

export async function getSocialAnalytics(): Promise<any> {
  const by = await pool.query(
    `SELECT platform, max(followers) FILTER (WHERE date = (SELECT max(date) FROM social_metrics s2 WHERE s2.platform = s.platform))::int AS followers,
            COALESCE(sum(reach),0)::int AS reach_30, COALESCE(sum(engagement),0)::int AS eng_30, COALESCE(sum(posts),0)::int AS posts_30
     FROM social_metrics s WHERE date > CURRENT_DATE - interval '30 days' GROUP BY platform`);
  const trend = await pool.query(
    `SELECT platform, date, followers, reach, engagement FROM social_metrics WHERE date > CURRENT_DATE - interval '30 days' ORDER BY date`);
  const top = await pool.query(
    `SELECT id, platform, content_type, caption, published_at, metrics FROM content_posts
     WHERE status = 'published' ORDER BY published_at DESC NULLS LAST LIMIT 10`);
  const funnel = await pool.query(
    `SELECT status, count(*)::int AS n FROM content_posts GROUP BY status`);
  return { byPlatform: by.rows, trend: trend.rows, recentPublished: top.rows, funnel: funnel.rows };
}
