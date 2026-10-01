// RBAC + employee workspaces test suite.
// Run: npx tsx scripts/test-rbac.ts   (needs DATABASE_URL)
// Covers: user lifecycle, lead scoping, call/task ops, stage safety,
// content approval gates, admin-only writes, recurring tasks, handoff tick.
import { pool } from "@/db";
import {
  ensureRbacSchema, createEmployee, setEmployeeStatus, setEmployeeRole,
  listEmployees, assignLeads, audit, notify, type CurrentUser,
} from "@/lib/auth/rbac";
import {
  listSalesLeads, getSalesLead, assertLeadAccess, logCall, addLeadNote,
  salesStageMove, createTask, completeTask, listTasks, getCallQueue,
  getSalesPerformance, autoCallTaskTick,
} from "@/lib/sales-workspace/ops";
import {
  createPost, getPost, updatePost, transitionPost, deletePost,
  createContentTask, completeContentTask, ensureRecurringTasks,
  saveAsset, updateAsset, deleteAsset, recordMetrics,
} from "@/lib/social-workspace/ops";
import { recordLogin, touchPresence, endSession } from "@/lib/auth/presence";

let pass = 0, fail = 0;
const results: string[] = [];
function ok(name: string, cond: any) {
  if (cond) { pass++; results.push(`PASS ${name}`); }
  else { fail++; results.push(`FAIL ${name}`); }
}
async function throws403(name: string, fn: () => Promise<any>) {
  try { await fn(); ok(name, false); }
  catch (e: any) { ok(name, e?.status === 403); }
}

const tag = `rbac${Date.now() % 100000}`;
const sysAdmin: CurrentUser = { id: 1, email: "admin@vyravo.ai", name: "T", role: "admin" };

async function main() {
  await ensureRbacSchema();
  ok("schema tables exist", (await pool.query(
    `SELECT count(*)::int n FROM information_schema.tables WHERE table_name IN
     ('sales_calls','sales_tasks','content_posts','content_tasks','social_assets','social_metrics','notifications','audit_log')`)).rows[0].n === 8);
  ok("workspace_role column exists", (await pool.query(
    `SELECT count(*)::int n FROM information_schema.columns WHERE table_name='kb_users' AND column_name='workspace_role'`)).rows[0].n === 1);

  // --- user lifecycle ---
  const s1 = await createEmployee({ name: "T Sales", email: `${tag}s1@test.local`, password: "password123", role: "sales" });
  const s2 = await createEmployee({ name: "T Sales2", email: `${tag}s2@test.local`, password: "password123", role: "sales" });
  const so = await createEmployee({ name: "T Social", email: `${tag}so@test.local`, password: "password123", role: "social" });
  const ad = await createEmployee({ name: "T Admin", email: `${tag}ad@test.local`, password: "password123", role: "admin" });
  ok("4 test users created", s1.id > 0 && so.id > 0 && ad.id > 0);
  const U1: CurrentUser = { id: s1.id, email: "", name: "T Sales", role: "sales" };
  const U2: CurrentUser = { id: s2.id, email: "", name: "T Sales2", role: "sales" };
  const USO: CurrentUser = { id: so.id, email: "", name: "T Social", role: "social" };
  const UAD: CurrentUser = { id: ad.id, email: "", name: "T Admin", role: "admin" };
  try { await createEmployee({ name: "x", email: `${tag}s1@test.local`, password: "password123", role: "sales" }); ok("dupe email rejected", false); }
  catch { ok("dupe email rejected", true); }
  try { await createEmployee({ name: "x", email: `${tag}x@test.local`, password: "short", role: "sales" }); ok("short password rejected", false); }
  catch { ok("short password rejected", true); }
  ok("listEmployees includes test users",
    (await listEmployees()).filter((e: any) => String(e.email).includes(tag)).length === 4);

  // --- lead scoping ---
  const lead = (await pool.query(
    `INSERT INTO leads (full_name, email, business_name, phone, stage, status, source, lead_score)
     VALUES ('RBAC T','${tag}@example.com','RBAC Co','+911234567890','contacted','active','rbac-test',70) RETURNING id`)).rows[0].id;
  ok("unassigned lead invisible to sales", (await listSalesLeads(U1)).every((l) => Number(l.id) !== Number(lead)));
  await assignLeads([lead], s1.id, sysAdmin);
  ok("assigned lead visible to owner", (await listSalesLeads(U1)).some((l) => Number(l.id) === Number(lead)));
  ok("assigned lead invisible to other sales", (await listSalesLeads(U2)).every((l) => Number(l.id) !== Number(lead)));
  ok("admin sees assigned lead", (await listSalesLeads(UAD, { q: tag })).some((l) => Number(l.id) === Number(lead)));
  ok("owner detail loads", (await getSalesLead(U1, lead))?.lead?.id === lead);
  ok("non-owner detail blocked", (await getSalesLead(U2, lead)) === null);
  await throws403("assertLeadAccess blocks non-owner", () => assertLeadAccess(U2, lead));

  // --- calls / notes ---
  const call = await logCall(U1, lead, { outcome: "interested", notes: "wants demo" });
  ok("call logged", call.id > 0);
  await throws403("non-owner cannot log call", () => logCall(U2, lead, { outcome: "connected" }));
  await addLeadNote(U1, lead, "hello note");
  ok("note added", true);
  await throws403("non-owner cannot note", () => addLeadNote(U2, lead, "x"));

  // --- tasks + dedupe ---
  const t1 = await createTask(U1, lead, { kind: "followup", dueAt: new Date(Date.now() + 864e5).toISOString() });
  ok("task created", t1.id > 0);
  try { await createTask(U1, lead, { kind: "followup" }); ok("dupe task rejected (409)", false); }
  catch (e: any) { ok("dupe task rejected (409)", e?.status === 409); }
  await throws403("non-owner cannot complete task", () => completeTask(U2, t1.id));
  await completeTask(U1, t1.id, "done");
  ok("owner completes task", (await listTasks(U1)).find((t) => t.id === t1.id)?.status === "done");
  const t2 = await createTask(U1, lead, { kind: "followup" });
  ok("new task allowed after done", t2.id > 0);

  // --- stage safety ---
  const mv = await salesStageMove(U1, lead, "qualified", "test");
  ok("qualified via lifecycle", !String(mv.result).startsWith("error"));
  ok("stage actually moved", (await pool.query(`SELECT stage FROM leads WHERE id=$1`, [lead])).rows[0].stage === "qualified");
  const won = await salesStageMove(U1, lead, "won", "says yes");
  ok("won becomes request, not stage", won.result.includes("admin confirms") &&
    (await pool.query(`SELECT stage FROM leads WHERE id=$1`, [lead])).rows[0].stage !== "won");
  ok("won escalation created", (await pool.query(
    `SELECT count(*)::int n FROM sales_escalations WHERE lead_id=$1 AND kind='deal_won_request'`, [lead])).rows[0].n >= 1);
  await throws403("bogus stage blocked", () => salesStageMove(U1, lead, "paid"));
  await throws403("non-owner stage blocked", () => salesStageMove(U2, lead, "qualified"));

  // --- performance scoping ---
  const perf = await getSalesPerformance(U1);
  ok("own performance loads", perf.userId === s1.id && perf.calls.n >= 1);
  await throws403("cannot view teammate performance", () => getSalesPerformance(U1, s2.id));
  ok("admin can view anyone", (await getSalesPerformance(UAD, s1.id)).userId === s1.id);

  // --- content workflow ---
  const p = await createPost(USO, { platform: "instagram", caption: "test post" });
  ok("social creates draft", p.id > 0);
  await transitionPost(USO, p.id, "pending_approval");
  ok("social submits for approval", (await getPost(USO, p.id)).status === "pending_approval");
  await throws403("social cannot approve own post", () => transitionPost(USO, p.id, "approved"));
  await throws403("social cannot publish unapproved", () => transitionPost(USO, p.id, "published"));
  await throws403("social cannot edit after submit", () => updatePost(USO, p.id, { caption: "sneaky" }));
  await throws403("social cannot delete submitted", () => deletePost(USO, p.id));
  await transitionPost(UAD, p.id, "approved", "looks good");
  await transitionPost(UAD, p.id, "published");
  ok("admin approves + publishes", (await getPost(UAD, p.id)).status === "published");
  const p2 = await createPost(USO, { caption: "draft2" });
  await deletePost(USO, p2.id);
  ok("social can delete own draft", (await getPost(USO, p2.id)) === null);
  ok("sales cannot see social post", (await getPost(U1 as any, p.id)) === null);

  // --- admin-only social writes ---
  await throws403("social cannot create tasks", () => createContentTask(USO, { title: "x" }));
  await throws403("social cannot save assets", () => saveAsset(USO, { name: "x" }));
  await throws403("sales cannot record metrics", () => recordMetrics(U1, { platform: "linkedin", followers: 1 }));
  await recordMetrics(USO, { platform: `rbac-test-${tag}`, followers: 10 });
  await recordMetrics(USO, { platform: `rbac-test-${tag}`, followers: 15 });
  ok("social records metrics", (await pool.query(`SELECT followers FROM social_metrics WHERE platform=$1`, [`rbac-test-${tag}`])).rows[0].followers === 15);
  ok("metrics history keeps each save", (await pool.query(`SELECT count(*)::int n FROM social_metric_log WHERE platform=$1`, [`rbac-test-${tag}`])).rows[0].n >= 2);
  const ast = await saveAsset(UAD, { name: `${tag} asset`, kind: "info", body: "hello" });
  ok("admin saves asset", ast.id > 0);
  await updateAsset(UAD, ast.id, { body: "hello world" });
  ok("admin updates asset", (await pool.query(`SELECT body FROM social_assets WHERE id=$1`, [ast.id])).rows[0].body === "hello world");
  await throws403("social cannot update assets", () => updateAsset(USO, ast.id, { body: "nope" }));
  await throws403("social cannot delete assets", () => deleteAsset(USO, ast.id));
  await deleteAsset(UAD, ast.id);
  ok("admin deletes asset", (await pool.query(`SELECT id FROM social_assets WHERE id=$1`, [ast.id])).rows.length === 0);
  const ct = await createContentTask(UAD, { title: `${tag} task`, assigneeId: so.id });
  ok("admin creates content task", ct.id > 0);
  await completeContentTask(USO, ct.id);
  ok("assignee completes task", true);

  // --- recurring ---
  await createContentTask(UAD, { title: `${tag} daily reel`, assigneeId: so.id, recurrence: "1,2,3,4,5" });
  const copies = (await pool.query(`SELECT count(*)::int n FROM content_tasks WHERE title = $1`, [`${tag} daily reel`])).rows[0].n;
  const made2 = await ensureRecurringTasks();
  ok("recurring spawns copies at creation", copies >= 2); // template + dated copies
  ok("recurring idempotent", made2 === 0);

  // --- handoff tick (score 999 + max 1: our fixture wins the slot, no real-lead blast radius) ---
  const hl = (await pool.query(
    `INSERT INTO leads (full_name, email, business_name, phone, stage, status, source, lead_score)
     VALUES ('Handoff','${tag}h@example.com','Handoff Co','+919999988888','contacted','active','rbac-test',999) RETURNING id`)).rows[0].id;
  await pool.query(`INSERT INTO outreach_events (lead_id, recipient_email, subject, body, follow_up_number, status, sent_at) VALUES ($1, '${tag}h@example.com', 't', 't', 0, 'sent', now() - interval '5 days')`, [hl]);
  const h1 = await autoCallTaskTick(1);
  const hOwner = (await pool.query(`SELECT owner_id FROM leads WHERE id=$1`, [hl])).rows[0].owner_id;
  ok("handoff creates call task + assigns", h1.created === 1 && (hOwner === s1.id || hOwner === s2.id));
  await autoCallTaskTick(1); // may touch one real lead (cleaned below); hl must stay at exactly 1 task
  const hlTasks = (await pool.query(`SELECT count(*)::int n FROM sales_tasks WHERE lead_id = $1 AND kind = 'call' AND status = 'open'`, [hl])).rows[0].n;
  ok("handoff idempotent per lead", hlTasks === 1);
  const HU: CurrentUser = hOwner === s1.id ? U1 : U2;
  ok("call queue shows task", (await getCallQueue(HU)).tasks.some((t: any) => Number(t.lead_id) === Number(hl)));

  // --- login presence ---
  await recordLogin(so.id, `sess-${tag}`, "1.2.3.4", "TestAgent");
  ok("login recorded", (await pool.query(`SELECT count(*)::int n FROM employee_sessions WHERE user_id=$1 AND session_id=$2`, [so.id, `sess-${tag}`])).rows[0].n === 1);
  await touchPresence(so.id, `sess-${tag}`);
  ok("presence stays open", (await pool.query(`SELECT logged_out_at FROM employee_sessions WHERE session_id=$1`, [`sess-${tag}`])).rows[0].logged_out_at === null);
  await endSession(`sess-${tag}`, "logout");
  ok("logout stamps session end", !!(await pool.query(`SELECT logged_out_at FROM employee_sessions WHERE session_id=$1`, [`sess-${tag}`])).rows[0].logged_out_at);
  const listed = (await listEmployees()).find((e: any) => e.id === so.id);
  ok("listEmployees includes presence fields", listed && "is_online" in listed && "today_secs" in listed);

  // --- role changes + disable ---
  await setEmployeeRole(s2.id, "social");
  ok("role change works", (await pool.query(`SELECT workspace_role w FROM kb_users WHERE id=$1`, [s2.id])).rows[0].w === "social");
  await recordLogin(so.id, `sess2-${tag}`, null, null);
  await setEmployeeStatus(so.id, false);
  ok("disable kills sessions", (await pool.query(`SELECT count(*)::int n FROM kb_sessions WHERE user_id=$1`, [so.id])).rows[0].n === 0);
  ok("disable closes presence", (await pool.query(`SELECT count(*)::int n FROM employee_sessions WHERE user_id=$1 AND logged_out_at IS NULL`, [so.id])).rows[0].n === 0);
  await setEmployeeStatus(so.id, true);

  // --- audit + notify ---
  const before = (await pool.query(`SELECT count(*)::int n FROM audit_log WHERE object_id IN ($1,$2)`, [String(lead), String(p.id)])).rows[0].n;
  await audit({ userId: s1.id, role: "sales", action: "test.ping", object: "lead", objectId: lead });
  const after = (await pool.query(`SELECT count(*)::int n FROM audit_log WHERE object_id IN ($1,$2)`, [String(lead), String(p.id)])).rows[0].n;
  ok("audit appends", after === before + 1);
  await notify({ userId: s1.id, title: "t" });
  ok("notify writes", (await pool.query(`SELECT count(*)::int n FROM notifications WHERE user_id=$1`, [s1.id])).rows[0].n >= 1);

  // --- cleanup (also reverses any tick side-effects on real leads) ---
  await pool.query(`DELETE FROM sales_tasks WHERE notes LIKE 'auto: sequence ended%' AND created_at > now() - interval '30 minutes'`);
  await pool.query(`UPDATE leads SET owner_id = NULL WHERE owner_id IN ($1,$2,$3,$4)`, [s1.id, s2.id, so.id, ad.id]);
  await pool.query(`DELETE FROM leads WHERE source = 'rbac-test'`);
  await pool.query(`DELETE FROM content_tasks WHERE title LIKE '${tag}%' OR description LIKE '%${tag}%'`);
  await pool.query(`DELETE FROM content_posts WHERE caption LIKE '%test post%' OR caption = 'draft2'`);
  await pool.query(`DELETE FROM social_metrics WHERE platform = 'instagram' AND followers = 0 AND date = CURRENT_DATE`);
  await pool.query(`DELETE FROM social_metric_log WHERE platform LIKE 'rbac-test-%'`);
  await pool.query(`DELETE FROM social_metrics WHERE platform LIKE 'rbac-test-%'`);
  await pool.query(`DELETE FROM kb_users WHERE email LIKE '${tag}%@test.local'`);
  await pool.query(`DELETE FROM kb_users WHERE email LIKE '${tag}%'`);
  ok("cleanup done", (await pool.query(`SELECT count(*)::int n FROM kb_users WHERE email LIKE '%test.local'`)).rows[0].n === 0);

  console.log(results.join("\n"));
  console.log(`\nRBAC: ${pass} passed, ${fail} failed`);
  await pool.end();
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => { console.error("FATAL", e); try { await pool.end(); } catch {} process.exit(1); });
