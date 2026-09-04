// ============================================================================
// LINKEDIN OUTREACH LIVE TEST — real DB, MOCKED send gateway (no real
// LinkedIn messages are ever sent). Uses ONLY synthetic leads; cleans up
// everything it creates, including on crash (finally block).
//
//   npx tsx scripts/linkedin-livetest.mts
// ============================================================================
import crypto from "node:crypto";
import { pool } from "../src/db/index";
import {
  ensureLinkedInSchema, discoverEligibleLeads, generateToday, approveActivity,
  editMessage, regenerateMessage, skipActivity, retryActivity, sendBatch,
  markSent, markReplied, scheduleFollowUps, getLinkedInDashboard,
} from "../src/lib/linkedin/pipeline";
import { getLinkedInConfig, saveLinkedInConfig, DEFAULT_LINKEDIN_CONFIG } from "../src/lib/linkedin/config";
import { generateLinkedInMessage, isValidLinkedInUrl } from "../src/lib/linkedin/generator";
import { getSenderMode } from "../src/lib/linkedin/sender";

// ---- MOCKED SEND GATEWAY (global fetch mock) ----
const sentCalls: any[] = [];
let gatewayMode: "ok" | "fail" = "ok";
globalThis.fetch = (async (url: any, opts: any) => {
  if (String(url).includes("mock-gateway.local")) {
    const body = JSON.parse(opts.body);
    sentCalls.push({ url: String(url), headers: opts.headers, ...body });
    if (gatewayMode === "fail") return { ok: false, status: 500, text: async () => "boom" };
    return { ok: true, json: async () => ({ id: "gw_" + sentCalls.length }) };
  }
  return { ok: true, json: async () => ({}) };
}) as any;
process.env.LINKEDIN_SEND_WEBHOOK_URL = "https://mock-gateway.local/send";
process.env.LINKEDIN_SEND_WEBHOOK_TOKEN = "mock-token";

let pass = 0, fail = 0;
const check = (t: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  \u2713 ${t} ${detail}`); }
  else { fail++; console.log(`  \u2717 ${t} ${detail}`); }
};

const synLeads: number[] = [];
const synActivities: number[] = [];

async function mockLead(over: Record<string, any> = {}): Promise<{ id: number }> {
  const ins = await pool.query(
    `INSERT INTO leads (full_name, email, business_name, industry, country, lead_score, source, status, linkedin_url, qualification_summary, biggest_challenge)
     VALUES ($1, $2, $3, $4, 'India', $5, 'lead_engine', $9, $6, $7, $8)
     RETURNING id`,
    [
      over.full_name || "LinkedIn Test Lead",
      over.email || `li-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.in`,
      over.business_name || "LinkedIn Test Co",
      over.industry || "dentist",
      over.lead_score ?? 65,
      over.linkedin_url ?? null,
      over.qualification_summary || "Synthetic lead for the LinkedIn outreach livetest.",
      over.biggest_challenge || "follow-ups are missed",
      over.status || "active",
    ]
  );
  const id = Number(ins.rows[0].id);
  synLeads.push(id);
  return { id };
}

async function cleanup() {
  if (synActivities.length) {
    await pool.query(`DELETE FROM linkedin_send_log WHERE activity_id = ANY($1::int[])`, [synActivities]);
    await pool.query(`DELETE FROM outreach_activities WHERE id = ANY($1::int[])`, [synActivities]);
  }
  synActivities.length = 0;
  if (synLeads.length) {
    await pool.query(`DELETE FROM outreach_activities WHERE lead_id = ANY($1::int[])`, [synLeads]);
    await pool.query(`DELETE FROM leads WHERE id = ANY($1::int[])`, [synLeads]);
  }
  synLeads.length = 0;
  await saveLinkedInConfig({ ...DEFAULT_LINKEDIN_CONFIG });
  // the "synthetic lead" name may vary; also remove any leftover by name pattern
  await pool.query(`DELETE FROM leads WHERE full_name LIKE 'LinkedIn Test%'`);
}

function track(id: number) { synActivities.push(id); return id; }

try {
  await ensureLinkedInSchema();
  /* eslint-disable */
  const logBase = Number((await pool.query(`SELECT count(*)::int n FROM linkedin_send_log`)).rows[0].n);

  // ---- schema ----
  const cols = (await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'leads' AND column_name LIKE 'linkedin_%'`
  )).rows.map((r: any) => r.column_name);
  check("leads LinkedIn columns created", cols.length >= 9, cols.join(","));
  const tabs = (await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_name IN ('outreach_activities','linkedin_config','linkedin_send_log')`
  )).rows.map((r: any) => r.table_name);
  check("outreach_activities / config / send_log created", tabs.length === 3, tabs.join(","));

  // ---- config defaults are safe ----
  const df = await getLinkedInConfig();
  check("defaults: sending OFF", df.enabled === false);
  check("defaults: approval required ON", df.approval_required === true);
  check("defaults: daily limit 10 / delays [3,7]", df.daily_limit === 10 && df.follow_up_days.join() === [3, 7].join(), `limit=${df.daily_limit} days=${df.follow_up_days}`);

  // ---- eligibility ----
  await saveLinkedInConfig({ min_score: 60 });
  const cfg = await getLinkedInConfig();
  const l1 = await mockLead({ full_name: "Priya Sharma", business_name: "Sunrise Dental", industry: "dentist", lead_score: 82, linkedin_url: "linkedin.com/in/priya-sharma-abc123" });
  const l2 = await mockLead({ full_name: "Rahul Verma", business_name: "Green Hospital", industry: "hospital", lead_score: 70 }); // no URL
  const l3 = await mockLead({ full_name: "Anita Rao", business_name: "Metro Clinic", industry: "clinic", lead_score: 74, linkedin_url: "https://notlinkedin.com/foo" }); // invalid
  const l4 = await mockLead({ full_name: "Suresh Patil", business_name: "Beta Labs", industry: "estate_agent", lead_score: 45, linkedin_url: "linkedin.com/in/suresh-patil-xyz" }); // low score
  const l5 = await mockLead({ full_name: "Kavita Joshi", business_name: "Gamma Clinic", industry: "clinic", lead_score: 88, linkedin_url: "linkedin.com/in/kavita-joshi-1", status: "do_not_contact" });
  const l6 = await mockLead({ full_name: "Rohan Kulkarni", business_name: "Delta Dental", industry: "dentist", lead_score: 90, linkedin_url: "linkedin.com/in/rohan-k-999" });
  await pool.query(`UPDATE leads SET converted_to_client_id = 999 WHERE id = $1`, [l6.id]);

  const elig = await discoverEligibleLeads(cfg);
  const byLead = (id: number) => elig.find((e) => Number(e.lead.id) === id);
  check("eligible with valid URL", byLead(l1.id)?.eligible === true);
  check("not eligible without URL", byLead(l2.id)?.eligible === false);
  check("not eligible with invalid URL", byLead(l3.id)?.eligible === false);
  check("not eligible below min score", byLead(l4.id)?.eligible === false);
  check("not eligible DNC", !byLead(l5.id)?.eligible);
  check("not eligible already a client", !byLead(l6.id)?.eligible);

  // ---- generation ----
  const g = await generateToday(cfg);
  check("generate: 1 message queued for the eligible lead", g.generated >= 1, `generated=${g.generated}`);
  const a1 = (await pool.query(
    `SELECT * FROM outreach_activities WHERE lead_id = $1 AND channel = 'linkedin' AND follow_up_number = 0`,
    [l1.id]
  )).rows[0];
  track(Number(a1.id));
  check("status = awaiting approval (approval ON)", a1.status === "awaiting_approval", a1.status);
  check("message generated with first name", a1.message.includes("Priya"), a1.message.slice(0, 80));
  check("message references real company", a1.message.includes("Sunrise") || a1.message.includes("dental") || a1.message.toLowerCase().includes("dentist"), "");
  check("personalization summary present", Boolean(a1.personalization_summary), a1.personalization_summary);
  check("message length ok", a1.message.length >= 40 && a1.message.length <= 400, `${a1.message.length} chars`);
  check("no fabricated 'I read your post'", !/read your (post|article)|saw your (post|video|podcast)/i.test(a1.message));
  check("lead mirror status updated", (await pool.query(`SELECT linkedin_status FROM leads WHERE id = $1`, [l1.id])).rows[0].linkedin_status === "awaiting_approval");

  // idempotent second run
  const g2 = await generateToday(cfg);
  check("generate is idempotent (no dup record)", g2.generated === 0 && Number((await pool.query(`SELECT count(*)::int n FROM outreach_activities WHERE lead_id = $1 AND channel = 'linkedin'`, [l1.id])).rows[0].n) === 1, `generated=${g2.generated}`);

  // message uniqueness across two eligible leads
  const l7 = await mockLead({ full_name: "Vikram Singh", business_name: "Epsilon Eye Care", industry: "clinic", lead_score: 81, linkedin_url: "linkedin.com/in/vikram-singh-eyecare" });
  const g3 = await generateToday(cfg);
  const a7 = (await pool.query(`SELECT * FROM outreach_activities WHERE lead_id = $1 AND channel='linkedin'`, [l7.id])).rows[0];
  track(Number(a7.id));
  check("generated for second lead", g3.generated >= 1, `generated=${g3.generated}`);
  check("different message per lead", a7.message !== a1.message);

  // ---- URL validity ----
  check("URL validator accepts linkedin.com/in", isValidLinkedInUrl("https://www.linkedin.com/in/john-doe-123"));
  check("URL validator rejects twitter", !isValidLinkedInUrl("https://twitter.com/john"));

  // ---- approval + queue ----
  const ap = await approveActivity(Number(a1.id));
  check("approve & queue works", ap.ok === true);
  const a1b = (await pool.query(`SELECT status FROM outreach_activities WHERE id = $1`, [a1.id])).rows[0];
  check("status after approval = queued", a1b.status === "queued", a1b.status);

  // ---- manual mode: no sender ⇒ nothing sent ----
  delete process.env.LINKEDIN_SEND_WEBHOOK_URL;
  check("sender mode = manual without env", getSenderMode() === "manual");
  await saveLinkedInConfig({ enabled: true, approval_required: false, daily_limit: 10, max_per_run: 10, min_delay_min: 0 });
  const m1 = await sendBatch(await getLinkedInConfig());
  check("manual mode: 0 sent, stays queued", m1.sent === 0 && m1.queued >= 1, JSON.stringify({ sent: m1.sent, queued: m1.queued, mode: m1.mode }));
  const a1c = (await pool.query(`SELECT status FROM outreach_activities WHERE id = $1`, [a1.id])).rows[0];
  check("row still queued in manual mode", a1c.status === "queued", a1c.status);
  process.env.LINKEDIN_SEND_WEBHOOK_URL = "https://mock-gateway.local/send";

  // ---- send via (mock) gateway: recipient = lead's own profile ----
  sentCalls.length = 0;
  const s1 = await sendBatch(await getLinkedInConfig());
  check("gateway send succeeds", s1.sent >= 1, JSON.stringify({ sent: s1.sent, mode: s1.mode }));
  const gwCall = sentCalls.find((c) => String(c.url).includes("mock-gateway"));
  check("recipient = lead's LinkedIn URL (dynamic)", gwCall?.profileUrl === "linkedin.com/in/priya-sharma-abc123", gwCall?.profileUrl);
  check("recipient is never akshay's profile", !String(gwCall?.profileUrl || "").toLowerCase().includes("akshay"));
  check("sent with actual message text", gwCall?.message?.length > 20);
  check("gateway auth header sent", String(gwCall?.headers?.Authorization || "").includes("Bearer mock-token"));
  const a1d = (await pool.query(`SELECT * FROM outreach_activities WHERE id = $1`, [a1.id])).rows[0];
  check("activity marked sent + provider id", a1d.status === "sent" && Boolean(a1d.provider_message_id), `${a1d.status} ${a1d.provider_message_id}`);
  const ld = (await pool.query(`SELECT linkedin_status, linkedin_sent_at, linkedin_follow_up_date FROM leads WHERE id = $1`, [l1.id])).rows[0];
  check("lead mirror set sent + follow-up date", ld.linkedin_status === "sent" && Boolean(ld.linkedin_sent_at) && Boolean(ld.linkedin_follow_up_date));
  const logBase2 = Number((await pool.query(`SELECT count(*)::int n FROM linkedin_send_log`)).rows[0].n); // after real sends

  // ---- daily limit ----
  const l8 = await mockLead({ full_name: "Neha Gupta", business_name: "Zeta Clinic", industry: "clinic", lead_score: 79, linkedin_url: "linkedin.com/in/neha-gupta-zeta" });
  await generateToday(cfg);
  const a8 = (await pool.query(`SELECT id FROM outreach_activities WHERE lead_id = $1`, [l8.id])).rows[0];
  track(Number(a8.id));
  await approveActivity(Number(a8.id));
  await saveLinkedInConfig({ daily_limit: 1, max_per_run: 5, min_delay_min: 0 });
  const s2 = await sendBatch(await getLinkedInConfig()); // 1 already sent today ⇒ remaining 0
  check("daily limit reached ⇒ capped", s2.capped === true && s2.sent === 0 && s2.queued === 0, JSON.stringify({ sent: s2.sent, capped: s2.capped }));
  const a8b = (await pool.query(`SELECT status FROM outreach_activities WHERE id = $1`, [a8.id])).rows[0];
  check("capped lead remains queued", a8b.status === "queued", a8b.status);

  // ---- emergency stop ----
  await saveLinkedInConfig({ emergency_stop: true, daily_limit: 10 });
  const s3 = await sendBatch(await getLinkedInConfig());
  check("emergency stop blocks sends", s3.stopped === true && s3.sent === 0, s3.mode);
  const a8c = (await pool.query(`SELECT status FROM outreach_activities WHERE id = $1`, [a8.id])).rows[0];
  check("row untouched during stop", a8c.status === "queued", a8c.status);
  await saveLinkedInConfig({ emergency_stop: false });

  // ---- test mode simulate: no state change ----
  await saveLinkedInConfig({ test_mode: true });
  const s4 = await sendBatch(await getLinkedInConfig());
  check("simulate reports would-be sent", s4.simulated === true && s4.queued >= 1, JSON.stringify({ sim: s4.simulated, queued: s4.queued }));
  const a8d = (await pool.query(`SELECT status FROM outreach_activities WHERE id = $1`, [a8.id])).rows[0];
  check("simulate leaves row queued", a8d.status === "queued", a8d.status);
  const s4log = Number((await pool.query(`SELECT count(*)::int n FROM linkedin_send_log`)).rows[0].n);
  check("simulate writes no send log", s4log === logBase2, `log=${s4log} base=${logBase2}`);
  await saveLinkedInConfig({ test_mode: false });

  // ---- failure path: gateway 500 → failed + error, retry recovers ----
  gatewayMode = "fail";
  const s5 = await sendBatch(await getLinkedInConfig());
  check("gateway failure marks failed", s5.failed >= 1, JSON.stringify({ failed: s5.failed }));
  const a8e = (await pool.query(`SELECT status, error FROM outreach_activities WHERE id = $1`, [a8.id])).rows[0];
  check("error stored", a8e.status === "failed" && Boolean(a8e.error), String(a8e.error).slice(0, 60));
  const lderr = (await pool.query(`SELECT linkedin_status, linkedin_error FROM leads WHERE id = $1`, [l8.id])).rows[0];
  check("lead mirror shows failed + error", lderr.linkedin_status === "failed" && Boolean(lderr.linkedin_error));
  gatewayMode = "ok";
  const rt = await retryActivity(Number(a8.id));
  check("retry moves failed → queued", rt.ok === true && (await pool.query(`SELECT status FROM outreach_activities WHERE id = $1`, [a8.id])).rows[0].status === "queued");
  // no duplicate record created on retry
  check("retry creates no duplicate record", Number((await pool.query(`SELECT count(*)::int n FROM outreach_activities WHERE lead_id = $1 AND follow_up_number = 0`, [l8.id])).rows[0].n) === 1);

  // ---- edit + regenerate ----
  const ed = await editMessage(Number(a8.id), "Hi Neha, came across Zeta Clinic. Curious how you handle enquiries today — open to connecting?");
  check("edit message works", ed.ok === true && (await pool.query(`SELECT message FROM outreach_activities WHERE id = $1`, [a8.id])).rows[0].message.includes("Neha"));
  const rg = await regenerateMessage(Number(a8.id));
  check("regenerate returns new message", rg.ok === true && typeof rg.message === "string" && rg.message.length > 20, `${String(rg.message).length} chars`);

  // ---- mark replied stops follow-ups ----
  await approveActivity(Number(a8.id)); // regenerate moved it back to awaiting_approval
  const mr = await markReplied(Number(a8.id));
  check("mark replied works", mr.ok === true);
  // FU1 due check: l1 was sent "now" → nothing due; backdate to 4 days → due
  await saveLinkedInConfig({ approval_required: true });
  await pool.query(`UPDATE outreach_activities SET sent_at = now() - interval '1 day' WHERE id = $1`, [a1.id]);
  const fuNone = await scheduleFollowUps(await getLinkedInConfig());
  check("no FU before day 3", fuNone === 0, `sched=${fuNone}`);
  await pool.query(`UPDATE outreach_activities SET sent_at = now() - interval '4 days' WHERE id = $1`, [a1.id]);
  const fu1 = await scheduleFollowUps(await getLinkedInConfig());
  const fu1row = (await pool.query(`SELECT * FROM outreach_activities WHERE lead_id = $1 AND follow_up_number = 1`, [l1.id])).rows[0];
  check("FU1 scheduled at day 3 (from intro)", fu1 >= 1 && Boolean(fu1row), `sched=${fu1}`);
  if (fu1row) track(Number(fu1row.id));
  check("FU1 awaits approval too", !fu1row || fu1row.status === "awaiting_approval", fu1row?.status);
  // FU2 not yet — FU1 not sent yet (day 7 also not reached)
  const fu2b = (await pool.query(`SELECT count(*)::int n FROM outreach_activities WHERE lead_id = $1 AND follow_up_number = 2`, [l1.id])).rows[0];
  check("FU2 not created while FU1 unsent", Number(fu2b.n) === 0);
  // now FU1 is sent + intro >= 7 days old → FU2
  if (!fu1row) { check("FU1 row exists for FU2 test", false, "fu1 missing"); }
  else {
  await pool.query(`UPDATE outreach_activities SET status = 'sent', sent_at = now() WHERE id = $1`, [fu1row.id]);
  await pool.query(`UPDATE outreach_activities SET sent_at = now() - interval '8 days' WHERE id = $1`, [a1.id]);
  const fu2 = await scheduleFollowUps(await getLinkedInConfig());
  const fu2row = (await pool.query(`SELECT * FROM outreach_activities WHERE lead_id = $1 AND follow_up_number = 2`, [l1.id])).rows[0];
  check("FU2 scheduled at day 7 (from intro)", fu2 >= 1 && Boolean(fu2row), `sched=${fu2}`);
  if (fu2row) track(Number(fu2row.id));
  }

  // replied lead gets NO follow-ups
  await saveLinkedInConfig({ approval_required: true });
  await pool.query(`UPDATE outreach_activities SET status = 'sent', replied_at = now(), sent_at = now() - interval '9 days' WHERE id = $1`, [a8.id]);
  const fuR = await scheduleFollowUps(await getLinkedInConfig());
  const fuRep = (await pool.query(`SELECT count(*)::int n FROM outreach_activities WHERE lead_id = $1 AND follow_up_number = 1`, [l8.id])).rows[0];
  check("no follow-up for replied lead", Number(fuRep.n) === 0);

  // ---- skip ----
  const sk = await skipActivity(Number(a7.id));
  check("skip works", sk.ok === true && (await pool.query(`SELECT status FROM outreach_activities WHERE id = $1`, [a7.id])).rows[0].status === "skipped");

  // ---- dashboard ----
  const dash = await getLinkedInDashboard();
  check("dashboard stats present", dash.stats.generated >= 1 && typeof dash.stats.replyRate === "number", JSON.stringify(dash.stats).slice(0, 140));
  check("dashboard queue lists items", Array.isArray(dash.queue) && dash.queue.length >= 3);
  check("sender reported", dash.sender && typeof dash.sender.mode === "string");

  // ---- uniqueness guard (unit) ----
  const genL1 = await generateLinkedInMessage((await pool.query(`SELECT * FROM leads WHERE id = $1`, [l7.id])).rows[0], 0);
  check("generator produces a message", genL1.message.length >= 40, `${genL1.message.length} chars`);
  check("generator summary is short", genL1.summary.length > 0 && genL1.summary.length <= 220);

  console.log(`\n===== RESULT: ${pass} passed, ${fail} failed =====`);
} catch (e: any) {
  console.error("LIVETEST ERROR:", e);
  fail++;
} finally {
  const synCopy = [...synLeads];
  const actCopy = [...synActivities];
  try { await cleanup(); } catch (e2: any) { console.error("cleanup error:", e2); }
  // verify cleanup
  const leftLead = synCopy.length
    ? Number((await pool.query(`SELECT count(*)::int n FROM leads WHERE id = ANY($1::int[])`, [synCopy]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n)
    : 0;
  const leftAct = actCopy.length
    ? Number((await pool.query(`SELECT count(*)::int n FROM outreach_activities WHERE id = ANY($1::int[])`, [actCopy]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n)
    : 0;
  console.log(`FINAL: ${pass} passed, ${fail} failed (leftover synthetic leads: ${leftLead}, activities: ${leftAct})`);
  await pool.end();
  if (fail) process.exit(1);
}
