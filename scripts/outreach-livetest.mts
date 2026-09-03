// ============================================================================
// LIVE TEST of the outreach pipeline against the real DB — with a MOCKED
// Resend (no real emails are sent). Creates rows, verifies, then CLEANS UP.
// Run: npx tsx scripts/outreach-livetest.mts
// ============================================================================
import crypto from "node:crypto";
import { pool } from "../src/db/index";
import {
  ensureOutreachSchema, ensureOutreachTemplates, runOutreachPipeline,
  generateAndQueue, discoverNewLeads, getOutreachDashboard,
  buildOutreachEmail, sendOutreachNow, markReplied, scheduleFollowUps,
} from "../src/lib/outreach/pipeline";
import { saveOutreachConfig, getOutreachConfig } from "../src/lib/outreach/config";
import { verifySvixSignature, handleResendEvent } from "../src/lib/outreach/webhook";

const shipped: any[] = [];
globalThis.fetch = (async (url: any, opts: any) => {
  const body = JSON.parse(opts.body);
  shipped.push({ url: String(url), ...body });
  return { ok: true, json: async () => ({ id: "mock_" + shipped.length }) };
}) as any;
process.env.RESEND_API_KEY = "re_mock_test_key";

let pass = 0, fail = 0;
const check = (t: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${t} ${detail}`); }
  else { fail++; console.log(`  ✗ ${t} ${detail}`); }
};

let SNAPSHOT_ID = 0;
const touchedLeads = new Set<number>();

async function cleanup() {
  // Restore (NOT delete) any real event (<= snapshot) that the real-path tests
  // mock-sent / webhook-mutated, so production state is exactly as before.
  const restoreIds = (await pool.query(`SELECT id::text FROM outreach_events WHERE id <= $1 AND resend_id LIKE 'mock_%'`, [SNAPSHOT_ID])).rows.map((r: any) => r.id);
  if (restoreIds.length) {
    await pool.query(`UPDATE email_queue SET status = 'pending', sent_at = NULL WHERE template_data->>'outreach_event_id' = ANY($1::text[])`, [restoreIds]);
    await pool.query(`UPDATE outreach_events SET status = 'queued', resend_id = NULL, sent_at = NULL, delivered_at = NULL WHERE id = ANY($1::int[])`, [restoreIds.map(Number)]);
    console.log(`  (restored ${restoreIds.length} real event(s) hijacked by tests)`);
  }
  await pool.query(`DELETE FROM email_queue WHERE template_data->>'outreach_event_id' IN (SELECT id::text FROM outreach_events WHERE id > $1)`, [SNAPSHOT_ID]);
  await pool.query(`DELETE FROM outreach_events WHERE id > $1`, [SNAPSHOT_ID]);
  const synIds: number[] = [];
  for (const row of await pool.query(`SELECT id FROM leads WHERE full_name = 'Pipeline Test Lead'`).then((r) => r.rows)) synIds.push(Number(row.id));
  if (synIds.length) {
    await pool.query(`DELETE FROM email_queue WHERE lead_id = ANY($1::int[])`, [synIds]);
    await pool.query(`DELETE FROM leads WHERE id = ANY($1::int[])`, [synIds]);
  }
  await pool.query(`DELETE FROM email_queue WHERE email_type = 'outreach' AND template_data->>'outreach_event_id' IS NULL AND created_at > now() - interval '2 hours'`);
  for (const id of touchedLeads) {
    await pool.query(`UPDATE leads SET status = 'active', last_contacted_at = NULL, next_follow_up = NULL WHERE id = $1`, [id]);
  }
  await saveOutreachConfig({
    auto_outreach: false, test_mode: false, test_recipient: "akshay.navale.work@gmail.com",
    daily_limit: 30, follow_up_days: [3, 7], min_gap_secs: 20, min_score: 60,
  });
}

try {
  await ensureOutreachSchema();
  /* eslint-disable */
  await ensureOutreachTemplates();
  SNAPSHOT_ID = Number((await pool.query(`SELECT COALESCE(max(id),0) m FROM outreach_events`)).rows[0].m);
  const baselineNonActive = new Set((await pool.query(`SELECT id FROM leads WHERE status IS DISTINCT FROM 'active'`)).rows.map((r: any) => Number(r.id)));
  const baselineEvents = Number((await pool.query(`SELECT count(*)::int n FROM outreach_events`)).rows[0].n);
  console.log("schema + templates ensured (snapshot id", SNAPSHOT_ID, "| baseline events:", baselineEvents, ")");

  await saveOutreachConfig({ auto_outreach: false, test_mode: false, daily_limit: 5, follow_up_days: [3, 7], min_gap_secs: 0, min_score: 60 });
  const cfg = await getOutreachConfig();
  check("config saved", cfg.daily_limit === 5 && cfg.auto_outreach === false);

  // discovery with min_score=0: most real leads already have queued events
  await saveOutreachConfig({ min_score: 0 });
  let eligible = await discoverNewLeads(await getOutreachConfig());
  const ins = await pool.query(
    `INSERT INTO leads (full_name, email, business_name, industry, country, lead_score, source, status, qualification_summary, biggest_challenge)
     VALUES ('Pipeline Test Lead', 'pipeline-test@example.in', 'Pipeline Test Co', 'IT services', 'India', 65, 'website', 'active',
             'Test lead created by the outreach livetest (deleted after).', 'Leads arrive daily but follow-ups are missed')
     RETURNING id`);
  const syntheticId = Number(ins.rows[0].id);
  touchedLeads.add(syntheticId);
  eligible.push(ins.rows[0]);
  check("pipeline has leads to process", eligible.length > 0, `eligible=${eligible.length} (incl. synthetic #${syntheticId})`);

  // ---- TEST 1: generate + queue ----
  const r1 = await runOutreachPipeline({});
  check("run1 queued new emails", r1.newQueued >= 1, `queued=${r1.newQueued}`);

  // ---- TEST 2: idempotency ----
  const r2 = await runOutreachPipeline({});
  check("run2 queued 0 (idempotent)", r2.newQueued === 0, `queued=${r2.newQueued}`);

  // ---- TEST 3: lead without email skipped ----
  const noEmail = (await pool.query(`SELECT id FROM leads WHERE email IS NULL OR TRIM(email) = '' ORDER BY id DESC LIMIT 1`)).rows[0];
  if (noEmail) {
    const gen = await generateAndQueue(cfg, { leadId: Number(noEmail.id) });
    check("no-email lead skipped", gen.queued === 0 && gen.skipped.some((s: string) => s.includes("#" + noEmail.id)), JSON.stringify(gen));
  }

  // ---- TEST 4: contacted lead excluded ----
  const leadIds = (await pool.query(`SELECT id FROM leads WHERE email ~* '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$' AND COALESCE(status,'active') NOT IN ('contacted','replied','won','lost','do_not_contact','skipped') AND COALESCE(lead_score,0) >= 60 ORDER BY lead_score DESC LIMIT 8`)).rows.map((l: any) => l.id);
  const cl = leadIds[0];
  touchedLeads.add(cl);
  await pool.query(`UPDATE leads SET status = 'contacted' WHERE id = $1`, [cl]);
  const eligible2 = await discoverNewLeads(await getOutreachConfig());
  check("contacted lead excluded", !eligible2.some((l: any) => l.id === cl));

  // ---- TEST 9: TEST MODE = dry run (never consumes events) ----
  await saveOutreachConfig({ auto_outreach: true, test_mode: true, daily_limit: 3, min_gap_secs: 0 });
  shipped.length = 0;
  const dry = await runOutreachPipeline({ send: true });
  check("dry-run delivered to test recipient", dry.sendResult.sent > 0, `drySent=${dry.sendResult?.sent}`);
  check("dry-run TO = test recipient", shipped.filter((s: any) => s.url.includes("resend.com/emails")).every((p: any) => p.to === "akshay.navale.work@gmail.com"));
  const evAfterDry = await pool.query(`SELECT count(*)::int n FROM outreach_events WHERE status = 'queued'`);
  const qAfterDry = await pool.query(`SELECT count(*)::int n FROM email_queue WHERE status = 'pending' AND template_data->>'outreach_event_id' IS NOT NULL`);
  check("dry-run leaves events queued", Number(evAfterDry.rows[0].n) >= 3, `queued=${evAfterDry.rows[0].n}`);
  check("dry-run leaves queue pending", Number(qAfterDry.rows[0].n) >= 3, `pending=${qAfterDry.rows[0].n}`);

  // ---- TEST 8 + 7: cap + recipient (real path, mocked) ----
  await saveOutreachConfig({ auto_outreach: true, test_mode: false, daily_limit: 3, min_gap_secs: 0 });
  shipped.length = 0;
  const r4 = await runOutreachPipeline({ send: true });
  check("auto-send capped at 3/day", r4.sendResult && r4.sendResult.sent === 3, JSON.stringify(r4.sendResult));
  const posted = shipped.filter((s: any) => s.url.includes("resend.com/emails"));
  check("TO = lead email (never akshay)", posted.every((p: any) => p.to !== "akshay.navale.work@gmail.com"), posted.map((p: any) => p.to).join(","));
  check("REPLY-TO = akshay", posted.every((p: any) => p.reply_to === "akshay.navale.work@gmail.com"));
  check("subject rendered, no {{}}", posted.every((p: any) => p.subject && !p.subject.includes("{{")), posted[0]?.subject);
  const cap2 = await runOutreachPipeline({ send: true });
  check("no extra sends beyond limit", cap2.sendResult.sent === 0, JSON.stringify(cap2.sendResult));

  // ---- TEST 6: AUTO OFF ⇒ no sends (even with send=1) ----
  await saveOutreachConfig({ auto_outreach: false, test_mode: false });
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
    await pool.query(`UPDATE leads SET status = 'active' WHERE id = $1`, [sentOne.lead_id]);
  }

  // ---- FOLLOW-UP timing: fu1 fires 3 days AFTER EMAIL 1 (not after send) ----
  const intro = (await pool.query(`SELECT * FROM outreach_events WHERE status = 'sent' AND test_send = false AND follow_up_number = 0 LIMIT 1`)).rows[0];
  if (intro) {
    await pool.query(`UPDATE outreach_events SET sent_at = now() - interval '4 days' WHERE id = $1`, [intro.id]);
    const before = Number((await pool.query(`SELECT count(*)::int n FROM outreach_events WHERE follow_up_number > 0`)).rows[0].n);
    const sched = await scheduleFollowUps(await getOutreachConfig());
    const fu = (await pool.query(`SELECT * FROM outreach_events WHERE lead_id = $1 AND follow_up_number = 1`, [intro.lead_id])).rows;
    check("fu1 scheduled at day 3 (from email 1)", fu.length === 1 && sched >= 1, `sched=${sched} fu1=${fu.length}`);
    const fu2 = (await pool.query(`SELECT * FROM outreach_events WHERE lead_id = $1 AND follow_up_number = 2`, [intro.lead_id])).rows;
    check("fu2 NOT scheduled yet (fu1 not sent)", fu2.length === 0);
    if (fu.length > 0) {
      // and: once fu1 is sent, fu2 waits until email1.sent_at + 7d
      await pool.query(`UPDATE outreach_events SET status = 'sent', sent_at = now() WHERE id = $1`, [fu[0].id]);
      const sched2 = await scheduleFollowUps(await getOutreachConfig());
      const fu2b = (await pool.query(`SELECT * FROM outreach_events WHERE lead_id = $1 AND follow_up_number = 2`, [intro.lead_id])).rows;
      check("fu2 NOT before day 7 from email 1", fu2b.length === 0, `sched2=${sched2}`);
      await pool.query(`UPDATE outreach_events SET sent_at = now() - interval '8 days' WHERE id = $1`, [intro.id]);
      const sched3 = await scheduleFollowUps(await getOutreachConfig());
      const fu2c = (await pool.query(`SELECT * FROM outreach_events WHERE lead_id = $1 AND follow_up_number = 2`, [intro.lead_id])).rows;
      check("fu2 scheduled once email1 >= 7 days old", fu2c.length === 1, `sched3=${sched3}`);
    }
  } else console.log("  (skip follow-up timing — no sent intro to mutate)");

  // ---- WEBHOOK: signature verify + event handling ----
  const secret = Buffer.from("whsec_testsecret_123").toString("base64");
  const body = '{"type":"email.delivered","data":{"id":"mock_1"}}';
  const ts = Math.floor(Date.now() / 1000);
  const expected = crypto.createHmac("sha256", Buffer.from(secret, "base64")).update(`${ts}.${body}`).digest("hex");
  const okSig = verifySvixSignature(secret, { id: "msg_1", timestamp: String(ts), signatures: `v1,${expected}` }, body);
  check("webhook valid signature accepted", okSig === true);
  check("webhook tampered body rejected", verifySvixSignature(secret, { id: "msg_1", timestamp: String(ts), signatures: `v1,${expected}` }, body + "x") === false);
  check("webhook stale timestamp rejected", verifySvixSignature(secret, { id: "msg_1", timestamp: String(ts - 400), signatures: `v1,${expected}` }, body) === false);

  const sentEv = (await pool.query(`SELECT * FROM outreach_events WHERE status = 'sent' AND test_send = false AND resend_id IS NOT NULL ORDER BY id DESC LIMIT 2`)).rows;
  if (sentEv.length >= 2) {
    const h1 = await handleResendEvent({ type: "email.delivered", data: { id: sentEv[0].resend_id } });
    check("delivered recorded", h1 === "delivered" && !!((await pool.query(`SELECT delivered_at FROM outreach_events WHERE id = $1`, [sentEv[0].id])).rows[0].delivered_at));
    const h2 = await handleResendEvent({ type: "email.bounced", data: { id: sentEv[1].resend_id } });
    const st2 = (await pool.query(`SELECT status FROM outreach_events WHERE id = $1`, [sentEv[1].id])).rows[0];
    check("bounce marks failed (stops follow-ups)", h2 === "bounced" && st2.status === "failed", st2.status);
    const h3 = await handleResendEvent({ type: "email.complained", data: { id: sentEv[0].resend_id } });
    const leadSt = (await pool.query(`SELECT status FROM leads WHERE id = $1`, [sentEv[0].lead_id])).rows[0];
    touchedLeads.add(Number(sentEv[0].lead_id));
    check("complaint → do_not_contact + cancelled", h3 === "complained" && leadSt.status === "do_not_contact", leadSt.status);
  } else console.log("  (skip webhook handling — need 2 sent events with resend ids)");

  // ---- preview + dashboard ----
  const sample = (await pool.query(`SELECT * FROM leads WHERE id = $1`, [leadIds[0]])).rows[0];
  const mail = await buildOutreachEmail(sample, 0);
  check("personalized subject", mail.subject.length > 5 && !mail.subject.includes("{{"));
  check("no fabrication placeholder", !mail.html.includes("undefined") && !mail.html.includes("null"));
  const dash = await getOutreachDashboard();
  check("dashboard returns stats + events", dash.stats.generated >= 3 && Array.isArray(dash.events));

  // ---- CLEANUP (also re-run in finally for crash safety) ----
  await cleanup();
  const leftover = await pool.query(`SELECT (SELECT count(*)::int FROM outreach_events WHERE id > $1) + (SELECT count(*)::int FROM outreach_events WHERE resend_id LIKE 'mock_%') AS n`, [SNAPSHOT_ID]);
  const nowNonActive = new Set((await pool.query(`SELECT id FROM leads WHERE status IS DISTINCT FROM 'active'`)).rows.map((r: any) => Number(r.id)));
  const newNonActive = [...nowNonActive].filter((i) => !baselineNonActive.has(i));
  check("cleanup complete", Number(leftover.rows[0].n) === 0);
  check("no lead left altered", newNonActive.length === 0, `altered=${newNonActive.join(",")}`);

  console.log(`\n===== RESULT: ${pass} passed, ${fail} failed =====`);
} catch (e: any) {
  console.error("LIVE TEST ERROR:", e);
  fail++;
} finally {
  try { await cleanup(); } catch (e2: any) { console.error("cleanup error:", e2); }
  await pool.end();
  console.log(`FINAL: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
