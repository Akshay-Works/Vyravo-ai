// ============================================================================
// LIVE TEST of the outreach pipeline against the real DB — with a MOCKED
// Resend (no real emails are sent). Creates rows, verifies, then CLEANS UP.
// Run: npx tsx scripts/outreach-livetest.ts
// ============================================================================
import { pool } from "../src/db/index";
import {
  ensureOutreachSchema, ensureOutreachTemplates, runOutreachPipeline,
  generateAndQueue, discoverNewLeads, getOutreachDashboard,
  buildOutreachEmail, sendOutreachNow, markReplied, doNotContact,
} from "../src/lib/outreach/pipeline";
import { saveOutreachConfig, getOutreachConfig } from "../src/lib/outreach/config";
import { DEFAULT_REPLY_TO } from "../src/lib/email/send";

const shipped: any[] = [];
globalThis.fetch = (async (url: any, opts: any) => {
  const body = JSON.parse(opts.body);
  shipped.push({ url: String(url), ...body });
  return { ok: true, json: async () => ({ id: "mock_" + shipped.length }) };
}) as any;
process.env.RESEND_API_KEY = "re_mock_test_key";

const log = (t: string, ...a: any[]) => console.log(`\n[TEST ${t}]`, ...a);
let pass = 0, fail = 0;
const check = (t: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${t} ${detail}`); }
  else { fail++; console.log(`  ✗ ${t} ${detail}`); }
};

let SNAPSHOT_ID = 0;       // max outreach_events.id before the test
const touchedLeads = new Set<number>(); // leads whose status we mutate → restore

async function cleanup() {
  // delete everything this test created (events + their queue rows)
  await pool.query(`DELETE FROM email_queue WHERE template_data->>'outreach_event_id' IN (SELECT id::text FROM outreach_events WHERE id > $1)`, [SNAPSHOT_ID]);
  await pool.query(`DELETE FROM outreach_events WHERE id > $1`, [SNAPSHOT_ID]);
  await pool.query(`DELETE FROM email_queue WHERE email_type = 'outreach' AND template_data->>'outreach_event_id' IS NULL AND created_at > now() - interval '2 hours'`);
  // restore leads (status → active, contact timestamps → null)
  for (const id of touchedLeads) {
    await pool.query(`UPDATE leads SET status = 'active', last_contacted_at = NULL, next_follow_up = NULL WHERE id = $1`, [id]);
  }
}

try {
  await ensureOutreachSchema();
  await ensureOutreachTemplates();
  SNAPSHOT_ID = Number((await pool.query(`SELECT COALESCE(max(id),0) m FROM outreach_events`)).rows[0].m);
  console.log("schema + templates ensured (snapshot id", SNAPSHOT_ID + ")");

  // ---- setup config (safe defaults for the test window) ----
  await saveOutreachConfig({
    auto_outreach: false, test_mode: false, test_recipient: "akshay.navale.work@gmail.com",
    daily_limit: 5, follow_up_days: [3, 7], min_gap_secs: 0, min_score: 60,
  });
  const cfg = await getOutreachConfig();
  check("config saved", cfg.daily_limit === 5 && cfg.auto_outreach === false);

  // ---- eligible lead count ----
  const eligible = await discoverNewLeads(cfg);
  console.log(`  eligible new leads with email: ${eligible.length}`);
  check("pipeline has leads to process", eligible.length > 0);
  if (!eligible.length) throw new Error("no eligible leads — abort");
  const leadIds = eligible.slice(0, 8).map((l: any) => l.id);

  // ---- TEST 1: generate + queue ----
  const r1 = await runOutreachPipeline({});
  check("run1 queued new emails", r1.newQueued >= 1, `queued=${r1.newQueued}`);
  const ev1 = await pool.query(`SELECT id, lead_id, recipient_email, subject, follow_up_number, status FROM outreach_events WHERE follow_up_number = 0 ORDER BY id DESC LIMIT 10`);
  check("events created with lead email as recipient", ev1.rows.every((e: any) => e.recipient_email && e.recipient_email.includes("@")));

  // ---- TEST 2: idempotency (run twice ⇒ no duplicates) ----
  const r2 = await runOutreachPipeline({});
  check("run2 queued 0 (idempotent)", r2.newQueued === 0, `queued=${r2.newQueued}`);
  const r3 = await runOutreachPipeline({});
  check("run3 still 0", r3.newQueued === 0, `queued=${r3.newQueued}`);

  // ---- TEST 3: lead without email is skipped, reason recorded ----
  const noEmail = (await pool.query(`SELECT id FROM leads WHERE email IS NULL OR TRIM(email) = '' ORDER BY id DESC LIMIT 1`)).rows[0];
  if (noEmail) {
    const gen = await generateAndQueue(cfg, { leadId: Number(noEmail.id) });
    check("no-email lead skipped", gen.queued === 0 && gen.skipped.some((s: string) => s.includes("#" + noEmail.id)), JSON.stringify(gen));
  }

  // ---- TEST 4: already contacted excluded ----
  const cl = leadIds[0];
  touchedLeads.add(cl);
  await pool.query(`UPDATE leads SET status = 'contacted' WHERE id = $1`, [cl]);
  const eligible2 = await discoverNewLeads(await getOutreachConfig());
  check("contacted lead excluded", !eligible2.some((l: any) => l.id === cl));

  // ---- TEST 8 + cap: AUTO ON, limit 3, TEST OFF — mocked send captures payload ----
  await saveOutreachConfig({ auto_outreach: true, daily_limit: 3, min_gap_secs: 0 });
  shipped.length = 0;
  const r4 = await runOutreachPipeline({ send: true });
  check("auto-send capped at 3/day", r4.sendResult && r4.sendResult.sent === 3, JSON.stringify(r4.sendResult));
  const posted = shipped.filter((s: any) => s.url.includes("resend.com/emails"));
  check("exactly 3 Resend calls", posted.length === 3, `calls=${posted.length}`);
  check("TO = lead email (never akshay's)", posted.every((p: any) => p.to && p.to !== "akshay.navale.work@gmail.com"), posted.map((p: any) => p.to).join(","));
  check("REPLY-TO = akshay always", posted.every((p: any) => p.reply_to === "akshay.navale.work@gmail.com") || posted.every((p: any) => p.reply_to === DEFAULT_REPLY_TO));
  check("subject rendered", posted.every((p: any) => p.subject && p.subject.length > 3 && !p.subject.includes("{{")), posted.map((p: any) => p.subject).slice(0, 2).join(" | "));
  check("from set", posted.every((p: any) => p.from));
  const sentEv = await pool.query(`SELECT count(*)::int n FROM outreach_events WHERE status = 'sent' AND sent_at::date = CURRENT_DATE`);
  check("events marked sent", Number(sentEv.rows[0].n) >= 3, `sent=${sentEv.rows[0].n}`);

  // ---- TEST 7: cap respected (limit already 3; 5th call should be capped) ----
  const r5 = await runOutreachPipeline({ send: true });
  check("no extra sends beyond limit", r5.sendResult.sent === 0, JSON.stringify(r5.sendResult));

  // ---- TEST 6: AUTO OFF ⇒ nothing sent even with send=1 ----
  await saveOutreachConfig({ auto_outreach: false });
  shipped.length = 0;
  const r6 = await runOutreachPipeline({ send: true });
  check("AUTO OFF ⇒ no sends", r6.sendResult === null && shipped.filter((s: any) => s.url.includes("resend.com/emails")).length === 0);

  // ---- TEST 5: reply cancels follow-ups ----
  const sentOne = (await pool.query(`SELECT e.*, l.status AS ls FROM outreach_events e JOIN leads l ON l.id = e.lead_id WHERE e.status = 'sent' AND e.test_send = false LIMIT 1`)).rows[0];
  if (sentOne) {
    touchedLeads.add(Number(sentOne.lead_id));
    await markReplied(Number(sentOne.lead_id));
    const st = (await pool.query(`SELECT status FROM leads WHERE id = $1`, [sentOne.lead_id])).rows[0];
    check("lead status = replied", st.status === "replied", st.status);
    const fu = await pool.query(`SELECT count(*)::int n FROM outreach_events WHERE lead_id = $1 AND follow_up_number > 0`, [sentOne.lead_id]);
    check("no follow-ups scheduled", Number(fu.rows[0].n) === 0);

    // DNC also cancels
    await doNotContact(Number(sentOne.lead_id));
    const st2 = (await pool.query(`SELECT status FROM leads WHERE id = $1`, [sentOne.lead_id])).rows[0];
    check("lead status = do_not_contact", st2.status === "do_not_contact", st2.status);
    // lead restored in cleanup()
  }

  // ---- preview content ----
  const sample = (await pool.query(`SELECT * FROM leads WHERE id = $1`, [leadIds[0]])).rows[0];
  const mail = await buildOutreachEmail(sample, 0);
  check("personalized subject", mail.subject.length > 5 && !mail.subject.includes("{{"));
  check("personalized body w/ real data", mail.html.includes("<p>") && !mail.html.includes("{{"), mail.html.slice(0, 80));
  check("no fabrication placeholder", !mail.html.includes("undefined") && !mail.html.includes("null"));

  // ---- dashboard ----
  const dash = await getOutreachDashboard();
  check("dashboard returns stats + events", dash.stats.generated >= 3 && Array.isArray(dash.events), JSON.stringify({ g: dash.stats.generated, s: dash.stats.sent }));

  // ---- restore config to shipped defaults ----
  await saveOutreachConfig({
    auto_outreach: false, test_mode: false, test_recipient: "akshay.navale.work@gmail.com",
    daily_limit: 30, follow_up_days: [3, 7], min_gap_secs: 20, min_score: 60,
  });

  // ---- CLEANUP: remove every test row + restore leads ----
  await cleanup();
  const leftover = await pool.query(`SELECT count(*)::int n FROM outreach_events WHERE id > $1`, [SNAPSHOT_ID]);
  check("cleanup complete", Number(leftover.rows[0].n) === 0);

  console.log(`\n===== RESULT: ${pass} passed, ${fail} failed =====`);
  if (fail) process.exit(1);
} catch (e: any) {
  console.error("LIVE TEST ERROR:", e);
  process.exit(2);
} finally {
  await pool.end();
}
