// ============================================================================
// SALES WORKSPACE — operates on the EXISTING CRM + lifecycle (no second CRM).
// Every query is scoped: admin sees all, sales sees owner_id=self only.
// Stage moves go through the lifecycle engine; everything is audited.
// Sales CANNOT delete leads, touch settings, or see secrets (no API exists).
// ============================================================================
import { pool } from "@/db";
import { ensureRbacSchema, audit, notify, type CurrentUser } from "@/lib/auth/rbac";

const scope = (u: CurrentUser) => (u.role === "admin" ? null : u.id);

export async function getSalesOverview(u: CurrentUser): Promise<any> {
  await ensureRbacSchema();
  const s = scope(u);
  const mine = s === null ? "" : "AND l.owner_id = $1";
  const args = s === null ? [] : [s];
  const one = async (sql: string) => (await pool.query(sql, args)).rows[0] || {};
  const c = await one(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE COALESCE(l.stage,'new') = 'new')::int AS new,
      count(*) FILTER (WHERE COALESCE(l.stage,'new') = 'contacted')::int AS contacted,
      count(*) FILTER (WHERE COALESCE(l.reply_received,false))::int AS replied,
      count(*) FILTER (WHERE COALESCE(l.stage,'new') = 'qualified')::int AS qualified,
      count(*) FILTER (WHERE COALESCE(l.stage,'new') = 'meeting_booked')::int AS meetings,
      count(*) FILTER (WHERE COALESCE(l.stage,'new') = 'proposal_sent')::int AS proposals,
      count(*) FILTER (WHERE COALESCE(l.stage,'new') = 'negotiation')::int AS negotiation,
      count(*) FILTER (WHERE COALESCE(l.stage,'new') = 'won')::int AS won,
      count(*) FILTER (WHERE COALESCE(l.stage,'new') IN ('lost','not_interested','unqualified'))::int AS lost,
      COALESCE(sum(l.deal_value) FILTER (WHERE COALESCE(l.stage,'new') = 'won'),0)::numeric AS revenue
    FROM leads l WHERE 1=1 ${mine}`);
  const t = await one(`SELECT count(*)::int AS due_today, count(*) FILTER (WHERE t.due_at < now())::int AS overdue
    FROM sales_tasks t JOIN leads l ON l.id = t.lead_id
    WHERE t.status = 'open' ${s === null ? "" : "AND t.user_id = $1"}`);
  const calls = await pool.query(
    `SELECT count(*)::int AS n FROM sales_calls c ${s === null ? "" : "WHERE c.user_id = $1"}${s === null ? " WHERE c.created_at::date = CURRENT_DATE" : " AND c.created_at::date = CURRENT_DATE"}`,
    args);
  const won = Number(c.won || 0), lost = Number(c.lost || 0);
  return {
    leads: c, tasks: t, callsToday: calls.rows[0]?.n || 0,
    conversion: won + lost > 0 ? Math.round((100 * won) / (won + lost)) : 0,
  };
}

export async function listSalesLeads(u: CurrentUser, opts: { q?: string; stage?: string; limit?: number } = {}): Promise<any[]> {
  await ensureRbacSchema();
  const s = scope(u);
  const conds: string[] = [];
  const args: any[] = [];
  if (s !== null) { args.push(s); conds.push(`l.owner_id = $${args.length}`); }
  if (opts.stage) { args.push(opts.stage); conds.push(`COALESCE(l.stage,'new') = $${args.length}`); }
  if (opts.q) {
    args.push(`%${opts.q.slice(0, 60)}%`);
    const i = args.length;
    conds.push(`(l.full_name ILIKE $${i} OR l.business_name ILIKE $${i} OR l.email ILIKE $${i} OR l.phone ILIKE $${i})`);
  }
  const r = await pool.query(
    `SELECT l.id, l.full_name, l.business_name, l.email, l.phone, l.business_website, l.city, l.country,
            l.industry, l.source, l.lead_score, l.stage, l.status, l.last_contacted_at, l.next_follow_up,
            l.deal_value, l.deal_currency, l.reply_received, l.next_action, u.name AS owner_name,
            (SELECT count(*)::int FROM sales_tasks t WHERE t.lead_id = l.id AND t.status = 'open') AS open_tasks
     FROM leads l LEFT JOIN kb_users u ON u.id = l.owner_id
     ${conds.length ? "WHERE " + conds.join(" AND ") : ""}
     ORDER BY l.next_follow_up NULLS LAST, l.lead_score DESC NULLS LAST, l.id DESC
     LIMIT ${Math.min(Math.max(opts.limit || 100, 1), 300)}`, args);
  return r.rows;
}

export async function getSalesLead(u: CurrentUser, leadId: number): Promise<any | null> {
  await ensureRbacSchema();
  const s = scope(u);
  const r = await pool.query(
    `SELECT l.*, u.name AS owner_name FROM leads l LEFT JOIN kb_users u ON u.id = l.owner_id
     WHERE l.id = $1 ${s === null ? "" : "AND l.owner_id = $2"}`, s === null ? [leadId] : [leadId, s]);
  if ((r.rowCount ?? 0) === 0) return null;
  const lead = r.rows[0];
  const calls = await pool.query(
    `SELECT c.*, u.name AS by_name FROM sales_calls c LEFT JOIN kb_users u ON u.id = c.user_id
     WHERE c.lead_id = $1 ORDER BY c.created_at DESC LIMIT 30`, [leadId]);
  const tasks = await pool.query(`SELECT * FROM sales_tasks WHERE lead_id = $1 ORDER BY status, due_at NULLS LAST LIMIT 20`, [leadId]);
  const meetings = await pool.query(`SELECT * FROM meetings WHERE lead_id = $1 ORDER BY scheduled_at DESC LIMIT 10`, [leadId]).catch(() => ({ rows: [] as any[] }));
  const mail = await pool.query(
    `SELECT direction, subject, from_email, classification, COALESCE(sent_at, processed_at, created_at) AS at
     FROM inbox_messages WHERE lead_id = $1 ORDER BY at DESC LIMIT 30`, [leadId]).catch(() => ({ rows: [] as any[] }));
  const acts = await pool.query(`SELECT action, description, created_at FROM activities WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 40`, [leadId]).catch(() => ({ rows: [] as any[] }));
  return { lead, calls: calls.rows, tasks: tasks.rows, meetings: meetings.rows, mail: mail.rows, activity: acts.rows };
}

/** Guard: sales may touch only their own leads (admin: any). */
export async function assertLeadAccess(u: CurrentUser, leadId: number): Promise<void> {
  if (u.role === "admin") return;
  const r = await pool.query(`SELECT 1 FROM leads WHERE id = $1 AND owner_id = $2`, [leadId, u.id]);
  if ((r.rowCount ?? 0) === 0) throw Object.assign(new Error("not your lead"), { status: 403 });
}

export const CALL_OUTCOMES = ["no_answer", "busy", "wrong_number", "connected", "interested",
  "not_interested", "callback_requested", "meeting_booked", "qualified", "lost"] as const;

export async function logCall(u: CurrentUser, leadId: number, input: {
  outcome: string; notes?: string; durationSecs?: number | null; nextFollowUp?: string | null;
}): Promise<{ id: number }> {
  await ensureRbacSchema();
  await assertLeadAccess(u, leadId);
  if (!(CALL_OUTCOMES as readonly string[]).includes(input.outcome)) throw new Error("bad outcome");
  const ins = await pool.query(
    `INSERT INTO sales_calls (lead_id, user_id, outcome, notes, duration_secs, next_follow_up)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [leadId, u.id, input.outcome, (input.notes || "").slice(0, 2000),
     input.durationSecs ?? null, input.nextFollowUp || null]);
  await pool.query(`UPDATE leads SET last_contacted_at = now(),
    next_follow_up = COALESCE($2, next_follow_up) WHERE id = $1`, [leadId, input.nextFollowUp || null]);
  await pool.query(`INSERT INTO activities (type, action, description, lead_id, created_at)
    VALUES ('lead','sales_call',$2,$1,now())`,
    [leadId, `${u.name} called — ${input.outcome}${input.notes ? `: ${input.notes.slice(0, 150)}` : ""}`]).catch(() => {});
  // Outcome → lifecycle (same engine as automation; audited).
  try {
    const { emitSalesEvent } = await import("@/lib/sales/lifecycle");
    const key = `call-${ins.rows[0].id}`;
    if (input.outcome === "meeting_booked")
      await emitSalesEvent({ key, type: "MEETING_BOOKED", leadId, payload: { reason: `meeting booked by ${u.name} on call` } });
    else if (input.outcome === "qualified")
      await emitSalesEvent({ key, type: "LEAD_QUALIFIED", leadId, payload: { reason: `qualified by ${u.name} on call` } });
    else if (input.outcome === "not_interested" || input.outcome === "lost")
      await emitSalesEvent({ key, type: "DEAL_LOST", leadId, payload: { to: input.outcome === "lost" ? "lost" : "not_interested", reason: `call outcome: ${input.outcome}` } });
    else if (input.outcome === "wrong_number")
      await emitSalesEvent({ key, type: "DEAL_LOST", leadId, payload: { to: "wrong_contact", reason: "wrong number on call" } });
  } catch { /* lifecycle failure never loses the call log */ }
  await audit({ userId: u.id, role: u.role, action: "sales.call", object: "lead", objectId: leadId,
    next: { outcome: input.outcome, callId: ins.rows[0].id } });
  return { id: Number(ins.rows[0].id) };
}

export async function addLeadNote(u: CurrentUser, leadId: number, note: string): Promise<void> {
  await assertLeadAccess(u, leadId);
  if (!note.trim()) throw new Error("empty note");
  await pool.query(`INSERT INTO activities (type, action, description, lead_id, created_at)
    VALUES ('lead','sales_note',$2,$1,now())`, [leadId, `${u.name}: ${note.slice(0, 500)}`]);
  await audit({ userId: u.id, role: u.role, action: "sales.note", object: "lead", objectId: leadId, next: { note: note.slice(0, 200) } });
}

const STAGE_ACTIONS: Record<string, { event: string; payload: (r: string) => any }> = {
  qualified: { event: "LEAD_QUALIFIED", payload: (r) => ({ reason: r }) },
  meeting_booked: { event: "MEETING_BOOKED", payload: (r) => ({ reason: r }) },
  proposal_sent: { event: "PROPOSAL_SENT", payload: (r) => ({ reason: r }) },
  negotiation: { event: "NEGOTIATION_STARTED", payload: (r) => ({ summary: r }) },
  lost: { event: "DEAL_LOST", payload: (r) => ({ to: "lost", reason: r }) },
  not_interested: { event: "DEAL_LOST", payload: (r) => ({ to: "not_interested", reason: r }) },
  nurture: { event: "DEAL_LOST", payload: (r) => ({ to: "nurture", reason: r }) },
  no_response: { event: "DEAL_LOST", payload: (r) => ({ to: "no_response", reason: r }) },
};

/** Sales moves stages through the SAME lifecycle engine (no bypass). */
export async function salesStageMove(u: CurrentUser, leadId: number, to: string, reason?: string): Promise<{ result: string }> {
  await assertLeadAccess(u, leadId);
  const t = String(to || "").toLowerCase();
  if (t === "won") {
    // "Mark won" = request: admin confirms the money, then completes the win.
    const { createEscalation } = await import("@/lib/sales/schema");
    await createEscalation({ lead_id: leadId, kind: "deal_won_request",
      title: `🏆 ${u.name} marked a win — confirm + invoice`,
      detail: reason?.slice(0, 500) || "Salesperson reports a closed deal.",
      recommendation: "Verify payment/agreement, then move to Paid/Won." });
    await audit({ userId: u.id, role: u.role, action: "sales.won_request", object: "lead", objectId: leadId });
    return { result: "win requested — admin confirms" };
  }
  const def = STAGE_ACTIONS[t];
  if (!def) throw Object.assign(new Error("stage move not permitted from Sales workspace"), { status: 403 });
  const { emitSalesEvent } = await import("@/lib/sales/lifecycle");
  const r = await emitSalesEvent({ key: `sales-${u.id}-${leadId}-${t}-${Date.now()}`, type: def.event, leadId, payload: def.payload(reason || `moved by ${u.name}`) });
  await audit({ userId: u.id, role: u.role, action: "sales.stage", object: "lead", objectId: leadId, next: { to: t, result: r.result } });
  return { result: r.result };
}

export async function createTask(u: CurrentUser, leadId: number, input: {
  kind?: string; title?: string; dueAt?: string | null; notes?: string; assigneeId?: number | null;
}): Promise<{ id: number }> {
  await ensureRbacSchema();
  await assertLeadAccess(u, leadId);
  const kind = ["call", "followup", "meeting_prep"].includes(input.kind || "") ? input.kind! : "followup";
  // Sales assigns to self; admin may assign to anyone on the sales team.
  let assignee = u.id;
  if (u.role === "admin" && input.assigneeId) {
    const chk = await pool.query(`SELECT 1 FROM kb_users WHERE id = $1 AND is_active = true`, [input.assigneeId]);
    if ((chk.rowCount ?? 0) === 0) throw new Error("bad assignee");
    assignee = Number(input.assigneeId);
  }
  try {
    const ins = await pool.query(
      `INSERT INTO sales_tasks (lead_id, user_id, kind, title, due_at, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [leadId, assignee, kind, (input.title || `${kind} — lead ${leadId}`).slice(0, 200),
       input.dueAt || null, (input.notes || "").slice(0, 1000), u.id]);
    if (input.dueAt) await pool.query(`UPDATE leads SET next_follow_up = $2 WHERE id = $1`, [leadId, input.dueAt]);
    await audit({ userId: u.id, role: u.role, action: "sales.task_created", object: "task", objectId: ins.rows[0].id, next: { leadId, kind } });
    if (assignee !== u.id) await notify({ userId: assignee, title: `📌 Task: ${kind} for lead #${leadId}`, link: "/sales/tasks" });
    return { id: Number(ins.rows[0].id) };
  } catch (e: any) {
    if (String(e?.code) === "23505") throw Object.assign(new Error("an open task of this kind already exists for this lead"), { status: 409 });
    throw e;
  }
}

export async function completeTask(u: CurrentUser, taskId: number, note?: string): Promise<void> {
  const t = (await pool.query(`SELECT * FROM sales_tasks WHERE id = $1`, [taskId])).rows[0];
  if (!t) throw new Error("task not found");
  if (u.role !== "admin" && Number(t.user_id) !== u.id) throw Object.assign(new Error("not your task"), { status: 403 });
  await pool.query(`UPDATE sales_tasks SET status = 'done', done_at = now(), notes = $2 WHERE id = $1`,
    [taskId, [t.notes, note ? `${u.name}: ${note.slice(0, 300)}` : ""].filter(Boolean).join("\n").slice(0, 1500)]);
  await audit({ userId: u.id, role: u.role, action: "sales.task_done", object: "task", objectId: taskId, next: { leadId: t.lead_id } });
}

export async function listTasks(u: CurrentUser, opts: { status?: string } = {}): Promise<any[]> {
  const s = scope(u);
  const r = await pool.query(
    `SELECT t.*, l.business_name, l.full_name, l.email, l.phone, l.stage, u2.name AS owner_name
     FROM sales_tasks t JOIN leads l ON l.id = t.lead_id LEFT JOIN kb_users u2 ON u2.id = t.user_id
     WHERE ($1::int IS NULL OR t.user_id = $1) ${opts.status ? "AND t.status = $2" : ""}
     ORDER BY CASE WHEN t.status = 'open' AND t.due_at < now() THEN 0 WHEN t.status = 'open' THEN 1 ELSE 2 END, t.due_at NULLS LAST LIMIT 200`,
    opts.status ? [s, opts.status] : [s]);
  return r.rows;
}

/** Call queue: explicit call tasks + auto-qualified leads (phone + contacted + silent). */
export async function getCallQueue(u: CurrentUser): Promise<any> {
  const s = scope(u);
  const tasks = await pool.query(
    `SELECT t.*, l.business_name, l.full_name, l.email, l.phone, l.lead_score, l.stage
     FROM sales_tasks t JOIN leads l ON l.id = t.lead_id
     WHERE t.status = 'open' AND t.kind = 'call' AND ($1::int IS NULL OR t.user_id = $1)
     ORDER BY t.due_at NULLS LAST LIMIT 100`, [s]);
  const auto = await pool.query(
    `SELECT l.id, l.business_name, l.full_name, l.email, l.phone, l.lead_score, l.stage, l.last_contacted_at
     FROM leads l
     WHERE COALESCE(l.stage,'new') = 'contacted' AND COALESCE(l.reply_received,false) = false
       AND l.phone IS NOT NULL AND TRIM(l.phone) <> ''
       AND COALESCE(l.status,'active') NOT IN ('replied','won','lost','do_not_contact','skipped')
       AND ($1::int IS NULL OR l.owner_id = $1)
       AND NOT EXISTS (SELECT 1 FROM sales_tasks t WHERE t.lead_id = l.id AND t.status = 'open' AND t.kind = 'call')
     ORDER BY l.lead_score DESC NULLS LAST LIMIT 50`, [s]);
  return { tasks: tasks.rows, suggested: auto.rows };
}

export async function getSalesMeetings(u: CurrentUser): Promise<any[]> {
  const s = scope(u);
  const r = await pool.query(
    `SELECT m.*, l.business_name, l.full_name FROM meetings m JOIN leads l ON l.id = m.lead_id
     WHERE ($1::int IS NULL OR l.owner_id = $1) ORDER BY m.scheduled_at DESC LIMIT 100`, [s]).catch(() => ({ rows: [] as any[] }));
  return r.rows;
}

export async function getSalesPerformance(u: CurrentUser, userId?: number): Promise<any> {
  if (u.role !== "admin" && userId != null && Number(userId) !== u.id)
    throw Object.assign(new Error("you can only view your own performance"), { status: 403 });
  const target = u.role === "admin" && userId ? Number(userId) : u.id;
  const one = async (sql: string) => (await pool.query(sql, [target])).rows[0] || {};
  const calls = await one(`SELECT count(*)::int AS n, count(*) FILTER (WHERE outcome IN ('interested','meeting_booked','qualified'))::int AS positive FROM sales_calls WHERE user_id = $1`);
  const tasks = await one(`SELECT count(*) FILTER (WHERE status = 'done')::int AS done, count(*) FILTER (WHERE status = 'open' AND due_at < now())::int AS overdue FROM sales_tasks WHERE user_id = $1`);
  const leads = await one(`SELECT count(*)::int AS assigned,
    count(*) FILTER (WHERE COALESCE(stage,'new') = 'qualified')::int AS qualified,
    count(*) FILTER (WHERE COALESCE(stage,'new') IN ('proposal_sent','negotiation','verbal_agreement'))::int AS proposals,
    count(*) FILTER (WHERE COALESCE(stage,'new') = 'won')::int AS won,
    COALESCE(sum(deal_value) FILTER (WHERE COALESCE(stage,'new') = 'won'),0)::numeric AS revenue FROM leads WHERE owner_id = $1`);
  const meetings = await one(`SELECT count(*)::int AS n FROM meetings m JOIN leads l ON l.id = m.lead_id WHERE l.owner_id = $1`).catch(() => ({ n: 0 }));
  return { userId: target, calls, tasks, leads, meetings: meetings.n || 0 };
}

/**
 * Handoff automation: contacted leads whose sequence ended 3+ days ago, silent,
 * with a phone number → get an open CALL task, assigned to the owner (or
 * round-robin to the least-loaded active sales user, who becomes the owner).
 * Bounded, idempotent (partial unique index), never touches replied/blocked.
 */
export async function autoCallTaskTick(max = 5): Promise<{ created: number }> {
  await ensureRbacSchema();
  let created = 0;
  const cands = await pool.query(
    `SELECT l.id, l.owner_id FROM leads l
     WHERE COALESCE(l.stage,'new') = 'contacted' AND COALESCE(l.reply_received,false) = false
       AND l.phone IS NOT NULL AND TRIM(l.phone) <> ''
       AND COALESCE(l.status,'active') NOT IN ('replied','won','lost','do_not_contact','skipped')
       AND EXISTS (SELECT 1 FROM outreach_events e WHERE e.lead_id = l.id AND e.status = 'sent'
                   AND COALESCE(e.sent_at, e.created_at) < now() - interval '3 days')
       AND NOT EXISTS (SELECT 1 FROM sales_tasks t WHERE t.lead_id = l.id AND t.status = 'open' AND t.kind = 'call')
     ORDER BY l.lead_score DESC NULLS LAST LIMIT $1`, [Math.min(Math.max(max, 1), 20)]);
  for (const c of cands.rows as any[]) {
    let assignee: number | null = c.owner_id != null ? Number(c.owner_id) : null;
    if (assignee !== null) {
      const ok = await pool.query(
        `SELECT 1 FROM kb_users WHERE id = $1 AND is_active = true AND COALESCE(workspace_role,'admin') IN ('admin','sales')`, [assignee]);
      if ((ok.rowCount ?? 0) === 0) assignee = null;
    }
    if (assignee === null) {
      const lb = await pool.query(
        `SELECT u.id FROM kb_users u LEFT JOIN sales_tasks t ON t.user_id = u.id AND t.status = 'open'
         WHERE u.is_active = true AND COALESCE(u.workspace_role,'admin') = 'sales'
         GROUP BY u.id ORDER BY count(t.id), u.id LIMIT 1`);
      assignee = lb.rows[0] ? Number(lb.rows[0].id) : null;
    }
    if (assignee === null) continue; // no sales team yet — admin sees them in Suggested
    try {
      await pool.query(
        `INSERT INTO sales_tasks (lead_id, user_id, kind, title, due_at, notes, created_by)
         VALUES ($1,$2,'call',$3, now() + interval '1 day', 'auto: sequence ended 3d+ ago, no reply — call now', NULL)`,
        [c.id, assignee, `call — lead ${c.id}`]);
      await pool.query(`UPDATE leads SET owner_id = $2 WHERE id = $1 AND (owner_id IS NULL OR owner_id <> $2)`, [c.id, assignee]);
      await notify({ userId: assignee, title: `📞 New call task — lead #${c.id}`, body: "Sequence ended, no reply. Call queue updated.", link: "/sales/calls" });
      created++;
    } catch { /* dupe race — unique index wins */ }
  }
  return { created };
}

export async function getTeamPerformance(): Promise<any[]> {
  const users = await pool.query(`SELECT id, name, email FROM kb_users WHERE is_active = true AND COALESCE(workspace_role,'admin') IN ('admin','sales') ORDER BY id`);
  const out: any[] = [];
  for (const x of users.rows as any[]) {
    const fake = { id: Number(x.id), email: x.email, name: x.name, role: "admin" as const };
    try {
      const p = await getSalesPerformance(fake, Number(x.id));
      out.push({ ...x, ...p });
    } catch { /* skip */ }
  }
  return out;
}
