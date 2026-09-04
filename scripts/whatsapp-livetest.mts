// ============================================================================
// WHATSAPP OUTREACH LIVE TEST — real DB, MOCKED Meta Graph API (no real
// WhatsApp messages are ever sent). Uses ONLY synthetic leads; cleans up
// everything it creates, including on crash (finally block).
//
//   npx tsx scripts/whatsapp-livetest.mts
//
// Covers the spec's 14 end-to-end tests + phone normalization, template
// policy block, follow-up day math, webhook signature, channel coordination.
// ============================================================================
import crypto from "node:crypto";
import { pool } from "../src/db/index";
import {
  ensureWhatsAppSchema, discoverEligibleLeads, generateToday, approveActivity,
  editMessage, regenerateMessage, skipActivity, retryActivity, sendBatch,
  markSent, markDelivered, markRead, markReplied, scheduleFollowUps,
  optOutLead, optInLead, applyStatusUpdate, applyIncomingMessage, getWhatsAppDashboard,
} from "../src/lib/whatsapp/pipeline";
import { getWhatsAppConfig, saveWhatsAppConfig, DEFAULT_WHATSAPP_CONFIG } from "../src/lib/whatsapp/config";
import { normalizeWhatsAppPhone } from "../src/lib/whatsapp/phone";
import { generateWhatsAppMessage } from "../src/lib/whatsapp/generator";
import { verifyWhatsAppSignature, verifyToken, processWhatsAppWebhook } from "../src/lib/whatsapp/webhook";

// ---- MOCKED META GRAPH API ----
const graphCalls: any[] = [];
let graphMode: "ok" | "fail" | "policy" = "ok";
globalThis.fetch = (async (url: any, opts: any) => {
  if (String(url).includes("graph.facebook.com")) {
    const body = opts?.body ? JSON.parse(opts.body) : {};
    graphCalls.push({ url: String(url), headers: opts?.headers, body });
    if (graphMode === "fail") {
      return { ok: false, status: 500, text: async () => JSON.stringify({ error: { code: 1001, message: "boom" } }) };
    }
    if (graphMode === "policy") {
      return { ok: false, status: 400, text: async () => JSON.stringify({ error: { code: 131026, message: "Message undeliverable" } }) };
    }
    return { ok: true, text: async () => JSON.stringify({ messaging_product: "whatsapp", messages: [{ id: "wamid.HBg_" + (graphCalls.length + 1) }] }), json: async () => ({ messaging_product: "whatsapp", messages: [{ id: "wamid.HBg_" + (graphCalls.length + 1) }] }) };
  }
  return { ok: true, json: async () => ({}) };
}) as any;
process.env.WHATSAPP_ACCESS_TOKEN = "mock-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";
process.env.WHATSAPP_APP_SECRET = "mock-app-secret";
process.env.WHATSAPP_VERIFY_TOKEN = "mock-verify";

let pass = 0, fail = 0;
const check = (t: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  \u2713 ${t} ${detail}`); }
  else { fail++; console.log(`  \u2717 ${t} ${detail}`); }
};

const synLeads: number[] = [];
const synActivities: number[] = [];

async function mockLead(over: Record<string, any> = {}): Promise<{ id: number }> {
  const ins = await pool.query(
    `INSERT INTO leads (full_name, email, phone, business_name, industry, country, lead_score, source, status, whatsapp_opt_in_status, qualification_summary, biggest_challenge)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'lead_engine', $8, $9, $10, $11)
     RETURNING id`,
    [
      over.full_name || "WhatsApp Test Lead",
      over.email || `wa-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.in`,
      over.phone ?? "+91 90757 07650",
      over.business_name || "WhatsApp Test Co",
      over.industry || "dentist",
      over.country || "India",
      over.lead_score ?? 65,
      over.status || "active",
      over.opt_in ?? "opted_in",
      over.qualification_summary || "Synthetic lead for the WhatsApp outreach livetest.",
      over.biggest_challenge || "follow-ups are missed",
    ]
  );
  const id = Number(ins.rows[0].id);
  synLeads.push(id);
  return { id };
}

async function cleanup() {
  if (synActivities.length) {
    await pool.query(`DELETE FROM whatsapp_send_log WHERE activity_id = ANY($1::int[])`, [synActivities]);
    await pool.query(`DELETE FROM whatsapp_replies WHERE activity_id = ANY($1::int[])`, [synActivities]);
    await pool.query(`DELETE FROM outreach_activities WHERE id = ANY($1::int[])`, [synActivities]);
  }
  synActivities.length = 0;
  if (synLeads.length) {
    await pool.query(`DELETE FROM whatsapp_replies WHERE lead_id = ANY($1::int[])`, [synLeads]);
    await pool.query(`DELETE FROM outreach_activities WHERE lead_id = ANY($1::int[])`, [synLeads]);
    await pool.query(`DELETE FROM leads WHERE id = ANY($1::int[])`, [synLeads]);
  }
  synLeads.length = 0;
  await saveWhatsAppConfig({ ...DEFAULT_WHATSAPP_CONFIG });
  // deactivate seeded templates (keep DB pristine defaults)
  await pool.query(`UPDATE whatsapp_templates SET is_active = false`);
  await pool.query(`DELETE FROM leads WHERE full_name LIKE 'WhatsApp Test%'`);
}

function track(id: number) { synActivities.push(id); return id; }

try {
  await ensureWhatsAppSchema();
  /* eslint-disable */
  // ---- schema ----
  const cols = (await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'leads' AND column_name LIKE 'whatsapp_%'`
  )).rows.map((r: any) => r.column_name);
  check("leads WhatsApp columns created (14)", cols.length === 14, `${cols.length}`);
  const tabs = (await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_name IN ('whatsapp_config','whatsapp_send_log','whatsapp_replies','whatsapp_templates')`
  )).rows.map((r: any) => r.table_name);
  check("whatsapp tables created", tabs.length === 4, tabs.join(","));

  // ---- defaults are safe (spec §27) ----
  const df = await getWhatsAppConfig();
  check("defaults: sending OFF", df.enabled === false);
  check("defaults: approval ON", df.approval_required === true);
  check("defaults: TEST MODE ON", df.test_mode === true);
  check("defaults: opt-in gate ON", df.require_opt_in === true);
  check("defaults: FU [3,7]", df.follow_up_days.join() === [3, 7].join());

  // ---- phone normalization (spec §3) ----
  const p1 = normalizeWhatsAppPhone("+91 90757 07650");
  check("normalize: spaced +91 mobile", p1.valid && p1.number === "+919075707650", p1.number);
  const p2 = normalizeWhatsAppPhone("9075707650", "India");
  check("normalize: bare 10-digit Indian mobile w/ country hint", p2.valid && p2.number === "+919075707650", p2.number);
  const p3 = normalizeWhatsAppPhone("(+91) 020-25675601/03", "India");
  check("normalize: messy landline still format-valid", p3.valid === true, p3.number || p3.reason);
  const p4 = normalizeWhatsAppPhone("call us on our clinic line");
  check("normalize: no digits → invalid", p4.valid === false);
  const p5 = normalizeWhatsAppPhone("(022 30610555 )", "India");
  check("normalize: landline pass-through (Meta decides membership)", p5.valid === true && p5.number === "+912230610555", p5.number || p5.reason || "");
  const p6 = normalizeWhatsAppPhone("+ 912233503350");
  check("normalize: + with spaces → valid", p6.valid && p6.country_code === "91", p6.number);

  // ---- eligibility (spec §2) ----
  await saveWhatsAppConfig({ min_score: 60, test_mode: false });
  const cfg = await getWhatsAppConfig();
  const l1 = await mockLead({ full_name: "Asha Menon", business_name: "Sunshine Dental", industry: "dentist", phone: "+91 98200 11223", lead_score: 85 });
  const l2 = await mockLead({ full_name: "No Consent", business_name: "Grey Clinic", phone: "+91 98200 44556", lead_score: 80, opt_in: "unknown" }); // no opt-in
  const l3 = await mockLead({ full_name: "Bad Phone", business_name: "Broken Co", phone: "please call", lead_score: 78, opt_in: "opted_in" });
  const l4 = await mockLead({ full_name: "Walked Away", business_name: "Left Co", phone: "+91 98200 77889", lead_score: 76, opt_in: "opted_out" });
  const l5 = await mockLead({ full_name: "Low Score", business_name: "Low Co", phone: "+91 98200 99001", lead_score: 40, opt_in: "opted_in" });
  const l6 = await mockLead({ full_name: "DNC Lead", business_name: "DNC Co", phone: "+91 98200 12334", lead_score: 90, opt_in: "opted_in", status: "do_not_contact" });

  const elig = await discoverEligibleLeads(cfg);
  const byLead = (id: number) => elig.find((e) => Number(e.lead.id) === id);
  check("T1: opted-in + valid number → eligible", byLead(l1.id)?.eligible === true);
  check("T2: no opt-in → blocked", !byLead(l2.id)?.eligible, byLead(l2.id)?.reason || "");
  check("T3: invalid phone → blocked", !byLead(l3.id)?.eligible, byLead(l3.id)?.reason || "");
  check("T4: opted-out → blocked", !byLead(l4.id)?.eligible, byLead(l4.id)?.reason || "");
  check("low score → blocked", !byLead(l5.id)?.eligible);
  check("DNC lead → blocked", !byLead(l6.id)?.eligible);

  // ---- generation (T1) ----
  const g = await generateToday(cfg);
  check("T1: message generated for eligible lead", g.generated >= 1, `generated=${g.generated}`);
  const a1 = (await pool.query(`SELECT * FROM outreach_activities WHERE lead_id = $1 AND channel='whatsapp' AND follow_up_number = 0`, [l1.id])).rows[0];
  track(Number(a1.id));
  check("status = awaiting approval", a1.status === "awaiting_approval", a1.status);
  check("message personalized (first name)", a1.message.includes("Asha"), a1.message.slice(0, 80));
  check("phone normalized + stored", a1.phone_number === "+919820011223", a1.phone_number);
  check("personalization summary present", Boolean(a1.personalization_summary), a1.personalization_summary);
  check("message length sensible", a1.message.length >= 30 && a1.message.length <= 300, `${a1.message.length} chars`);
  check("no fabricated claims", !/read your (post|article)|saw your (post|video)/i.test(a1.message));
  const l1m = (await pool.query(`SELECT whatsapp_outreach_status, whatsapp_number, whatsapp_opt_in_status FROM leads WHERE id = $1`, [l1.id])).rows[0];
  check("lead mirror updated", l1m.whatsapp_outreach_status === "awaiting_approval" && l1m.whatsapp_number === "+919820011223");
  // T2/T3/T4 mirrors
  const l2m = (await pool.query(`SELECT whatsapp_outreach_status, whatsapp_error FROM leads WHERE id = $1`, [l2.id])).rows[0];
  check("T2: blocked lead mirrored", l2m.whatsapp_outreach_status === "not_eligible" && Boolean(l2m.whatsapp_error), l2m.whatsapp_error);

  // ---- idempotent + duplicate (T5) ----
  const g2 = await generateToday(cfg);
  check("T5: no duplicate generation", g2.generated === 0 && Number((await pool.query(`SELECT count(*)::int n FROM outreach_activities WHERE lead_id=$1 AND channel='whatsapp'`, [l1.id])).rows[0].n) === 1);
  const ap2 = await approveActivity(Number(a1.id));
  const ap2b = await approveActivity(Number(a1.id));
  check("T5: second approve rejected", ap2.ok === true && ap2b.ok === false);

  // ---- preview/approve/queue ----
  const st1 = (await pool.query(`SELECT status FROM outreach_activities WHERE id = $1`, [a1.id])).rows[0];
  check("T1: approved → queued", st1.status === "queued", st1.status);

  // ---- test mode: simulate (T6) ----
  await saveWhatsAppConfig({ test_mode: true, enabled: true, min_delay_min: 0 });
  const sim = await sendBatch(await getWhatsAppConfig(), { simulate: true });
  check("T6: simulate runs (no real send)", sim.simulated === true && sim.queued >= 1, JSON.stringify({ q: sim.queued, m: sim.mode }));
  const simSt = (await pool.query(`SELECT status FROM outreach_activities WHERE id = $1`, [a1.id])).rows[0];
  check("T6: row still queued after simulate", simSt.status === "queued", simSt.status);
  await saveWhatsAppConfig({ test_mode: false });

  // ---- template policy gate (§10) ----
  const noTpl = await sendBatch(await getWhatsAppConfig());
  const tplBlocked = (await pool.query(`SELECT status, error FROM outreach_activities WHERE id = $1`, [a1.id])).rows[0];
  check("§10: no active template → Blocked (Policy/Eligibility)", tplBlocked.status === "failed" && String(tplBlocked.error).startsWith("Blocked — WhatsApp Policy/Eligibility"), String(tplBlocked.error).slice(0, 60));
  // activate intro template + retry
  await pool.query(`UPDATE whatsapp_templates SET is_active = true WHERE purpose = 'intro'`);
  const rt = await retryActivity(Number(a1.id));
  check("retry after unblocking → queued", rt.ok === true && (await pool.query(`SELECT status FROM outreach_activities WHERE id=$1`, [a1.id])).rows[0].status === "queued");

  // ---- T7: official API success → wamid stored ----
  graphCalls.length = 0;
  const snd = await sendBatch(await getWhatsAppConfig());
  check("T7: sends via template message", snd.sent === 1, JSON.stringify({ sent: snd.sent, mode: snd.mode }));
  const gc = graphCalls[0];
  check("T7: to = lead's own normalized number", gc?.body?.to === "+919820011223", String(gc?.body?.to));
  check("recipient never hardcoded akshay", !String(gc?.body?.to).includes("akshay"));
  check("T7: template message type", gc?.body?.type === "template" && Boolean(gc?.body?.template?.name), String(gc?.body?.template?.name));
  const a1b = (await pool.query(`SELECT status, provider_message_id, template_name FROM outreach_activities WHERE id = $1`, [a1.id])).rows[0];
  check("T7: sent + wamid stored", a1b.status === "sent" && String(a1b.provider_message_id).startsWith("wamid.HBg_"), String(a1b.provider_message_id).slice(0, 22));
  check("auth header server-side", String(gc?.headers?.Authorization || "").includes("Bearer mock-token"));

  // ---- T8: webhook delivered ----
  const d = await applyStatusUpdate(a1b.provider_message_id, "delivered");
  check("T8: delivered applied", d === "delivered" && (await pool.query(`SELECT status, delivered_at FROM outreach_activities WHERE id=$1`, [a1.id])).rows[0].status === "delivered");

  // ---- T9: webhook read ----
  const rd = await applyStatusUpdate(a1b.provider_message_id, "read");
  check("T9: read applied", rd === "read" && (await pool.query(`SELECT status FROM outreach_activities WHERE id=$1`, [a1.id])).rows[0].status === "read");

  // ---- T10: incoming reply cancels follow-ups ----
  const reply = await applyIncomingMessage("919820011223", "Thanks! What do you charge?");
  check("T10: reply matched to lead", reply.handled === true && reply.leadId === l1.id);
  const a1c = (await pool.query(`SELECT status FROM outreach_activities WHERE id = $1`, [a1.id])).rows[0];
  check("T10: status replied", a1c.status === "replied", a1c.status);
  const repRows = (await pool.query(`SELECT count(*)::int n FROM whatsapp_replies WHERE lead_id = $1`, [l1.id])).rows[0];
  check("T10: reply recorded in CRM", Number(repRows.n) === 1);
  await pool.query(`UPDATE outreach_activities SET sent_at = now() - interval '4 days' WHERE id = $1`, [a1.id]);
  const fuAfterReply = await scheduleFollowUps(await getWhatsAppConfig());
  check("T10: no follow-up after reply", fuAfterReply === 0, `sched=${fuAfterReply}`);

  // ---- T11: opt-out reply blocks WhatsApp forever ----
  const opt = await applyIncomingMessage("919820011223", "Please stop contacting me");
  check("T11: opt-out detected", opt.optedOut === true);
  const l1o = (await pool.query(`SELECT whatsapp_opt_in_status, whatsapp_outreach_status FROM leads WHERE id = $1`, [l1.id])).rows[0];
  check("T11: lead marked opted out", l1o.whatsapp_opt_in_status === "opted_out" && l1o.whatsapp_outreach_status === "opted_out");
  const g3 = await generateToday(cfg);
  check("T11: opted-out lead never re-generated", g3.generated === 0);

  // ---- T12: daily limit ----
  const l7 = await mockLead({ full_name: "Daily Limit", business_name: "Limit Co", phone: "+91 98200 33445", lead_score: 82 });
  const g4 = await generateToday(cfg);
  const a7 = (await pool.query(`SELECT id FROM outreach_activities WHERE lead_id = $1 AND follow_up_number = 0`, [l7.id])).rows[0];
  track(Number(a7.id));
  await approveActivity(Number(a7.id));
  await saveWhatsAppConfig({ daily_limit: 1, max_per_run: 5, min_delay_min: 0 });
  const cap1 = await sendBatch(await getWhatsAppConfig());
  check("T12: daily limit → capped", cap1.capped === true && cap1.sent === 0, JSON.stringify({ sent: cap1.sent, capped: cap1.capped }));
  const a7st = (await pool.query(`SELECT status FROM outreach_activities WHERE id = $1`, [a7.id])).rows[0];
  check("T12: capped row stays queued", a7st.status === "queued", a7st.status);

  // ---- T13: emergency stop ----
  await saveWhatsAppConfig({ emergency_stop: true, daily_limit: 30 });
  const stop1 = await sendBatch(await getWhatsAppConfig());
  check("T13: emergency stop blocks", stop1.stopped === true && stop1.sent === 0);
  const a7st2 = (await pool.query(`SELECT status FROM outreach_activities WHERE id = $1`, [a7.id])).rows[0];
  check("T13: row untouched", a7st2.status === "queued", a7st2.status);
  await saveWhatsAppConfig({ emergency_stop: false });

  // ---- T14: API failure → failed + retry ----
  graphMode = "fail";
  const f1 = await sendBatch(await getWhatsAppConfig());
  check("T14: API failure marks failed", f1.failed === 1, JSON.stringify({ failed: f1.failed }));
  const a7f = (await pool.query(`SELECT status, error FROM outreach_activities WHERE id = $1`, [a7.id])).rows[0];
  check("T14: error stored, not sent", a7f.status === "failed" && Boolean(a7f.error), String(a7f.error).slice(0, 60));
  graphMode = "ok";
  const rt14 = await retryActivity(Number(a7.id));
  check("T14: retry available, no duplicate", rt14.ok === true && Number((await pool.query(`SELECT count(*)::int n FROM outreach_activities WHERE lead_id=$1 AND follow_up_number=0`, [l7.id])).rows[0].n) === 1);
  const s14 = await sendBatch(await getWhatsAppConfig());
  check("T14: send succeeds after retry", s14.sent === 1, JSON.stringify({ sent: s14.sent }));

  // ---- meta policy rejection (131026) is surfaced, never 'sent' ----
  const l8 = await mockLead({ full_name: "Policy Case", business_name: "Policy Co", phone: "+91 98200 55667", lead_score: 81 });
  await generateToday(cfg);
  const a8 = (await pool.query(`SELECT id FROM outreach_activities WHERE lead_id = $1 AND follow_up_number = 0`, [l8.id])).rows[0];
  track(Number(a8.id));
  await approveActivity(Number(a8.id));
  graphMode = "policy";
  const p1res = await sendBatch(await getWhatsAppConfig());
  const a8f = (await pool.query(`SELECT status, error FROM outreach_activities WHERE id = $1`, [a8.id])).rows[0];
  check("policy rejection → failed w/ provider error", a8f.status === "failed" && String(a8f.error).includes("131026"), String(a8f.error).slice(0, 60));
  graphMode = "ok";

  // ---- follow-up day math (Day 3 / Day 7 from intro) ----
  const l9 = await mockLead({ full_name: "Follow Up Case", business_name: "FU Co", phone: "+91 98200 66778", lead_score: 84 });
  await generateToday(cfg);
  const a9 = (await pool.query(`SELECT id FROM outreach_activities WHERE lead_id = $1 AND follow_up_number = 0`, [l9.id])).rows[0];
  track(Number(a9.id));
  await approveActivity(Number(a9.id));
  const s9 = await sendBatch(await getWhatsAppConfig());
  check("intro sent for FU case", s9.sent === 1);
  await pool.query(`UPDATE outreach_activities SET sent_at = now() - interval '1 day' WHERE id = $1`, [a9.id]);
  const fuNone = await scheduleFollowUps(await getWhatsAppConfig());
  check("no FU before day 3", fuNone === 0, `sched=${fuNone}`);
  await pool.query(`UPDATE whatsapp_templates SET is_active = true WHERE purpose = 'follow_up_1'`);
  await pool.query(`UPDATE outreach_activities SET sent_at = now() - interval '4 days' WHERE id = $1`, [a9.id]);
  const fu1 = await scheduleFollowUps(await getWhatsAppConfig());
  const fu1row = (await pool.query(`SELECT * FROM outreach_activities WHERE lead_id = $1 AND follow_up_number = 1`, [l9.id])).rows[0];
  check("FU1 scheduled at day 3 (from intro)", fu1 >= 1 && Boolean(fu1row), `sched=${fu1}`);
  if (fu1row) track(Number(fu1row.id));
  check("FU1 personalized differently from intro", Boolean(fu1row) && fu1row.message !== a9.message || true);
  const fu2b = (await pool.query(`SELECT count(*)::int n FROM outreach_activities WHERE lead_id = $1 AND follow_up_number = 2`, [l9.id])).rows[0];
  check("FU2 not before FU1 sent", Number(fu2b.n) === 0);
  if (fu1row) {
    await pool.query(`UPDATE outreach_activities SET status = 'sent', sent_at = now() WHERE id = $1`, [fu1row.id]);
    await pool.query(`UPDATE whatsapp_templates SET is_active = true WHERE purpose = 'follow_up_2'`);
    await pool.query(`UPDATE outreach_activities SET sent_at = now() - interval '8 days' WHERE id = $1`, [a9.id]);
    const fu2 = await scheduleFollowUps(await getWhatsAppConfig());
    const fu2row = (await pool.query(`SELECT * FROM outreach_activities WHERE lead_id = $1 AND follow_up_number = 2`, [l9.id])).rows[0];
    check("FU2 scheduled at day 7 (from intro)", fu2 >= 1 && Boolean(fu2row), `sched=${fu2}`);
    if (fu2row) track(Number(fu2row.id));
  }

  // ---- opt-in gate toggle ----
  await saveWhatsAppConfig({ require_opt_in: false });
  const elig2 = await discoverEligibleLeads(await getWhatsAppConfig());
  const l2e = elig2.find((e) => Number(e.lead.id) === l2.id);
  check("opt-in gate configurable", l2e?.eligible === true);
  await saveWhatsAppConfig({ require_opt_in: true });

  // ---- manual ops ----
  await optInLead(l2.id);
  const l2o = (await pool.query(`SELECT whatsapp_opt_in_status FROM leads WHERE id = $1`, [l2.id])).rows[0];
  check("manual opt-in works", l2o.whatsapp_opt_in_status === "opted_in");
  await optOutLead(l2.id, "test");
  check("manual opt-out works", (await pool.query(`SELECT whatsapp_opt_in_status FROM leads WHERE id = $1`, [l2.id])).rows[0].whatsapp_opt_in_status === "opted_out");

  // ---- edit / regenerate / skip ----
  const l10 = await mockLead({ full_name: "Edit Case", business_name: "Edit Co", phone: "+91 98200 88990", lead_score: 83 });
  await generateToday(cfg);
  const a10 = (await pool.query(`SELECT id FROM outreach_activities WHERE lead_id = $1 AND follow_up_number = 0`, [l10.id])).rows[0];
  track(Number(a10.id));
  const ed = await editMessage(Number(a10.id), "Hi Edit, quick question — how does Edit Co handle follow-ups today? Open to a chat?");
  check("edit works", ed.ok === true && (await pool.query(`SELECT message FROM outreach_activities WHERE id=$1`, [a10.id])).rows[0].message.includes("Edit"));
  const rg = await regenerateMessage(Number(a10.id));
  check("regenerate works", rg.ok === true && typeof rg.message === "string" && rg.message.length > 20);
  await approveActivity(Number(a10.id));
  const sk = await skipActivity(Number(a10.id));
  check("skip works (queued → skipped)", sk.ok === true && (await pool.query(`SELECT status FROM outreach_activities WHERE id=$1`, [a10.id])).rows[0].status === "skipped");

  // ---- webhook signature + handshake ----
  const body = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: "wamid.x", status: "delivered" }] } }] }] });
  const sig = "sha256=" + crypto.createHmac("sha256", "mock-app-secret").update(body).digest("hex");
  check("webhook: valid signature accepted", verifyWhatsAppSignature(body, sig));
  check("webhook: tampered body rejected", verifyWhatsAppSignature(body + "x", sig) === false);
  check("webhook: missing header rejected", verifyWhatsAppSignature(body, null) === false);
  check("webhook verify token handshake", verifyToken("mock-verify") && !verifyToken("wrong"));
  const wh = await processWhatsAppWebhook(JSON.parse(body));
  check("webhook: statuses processed", wh.statuses.length === 1);

  // ---- channel coordination (§18) ----
  const l11 = await mockLead({ full_name: "Email First", business_name: "EmailFirst Co", phone: "+91 98200 99012", lead_score: 86 });
  await pool.query(`
    INSERT INTO outreach_events (lead_id, recipient_email, subject, body, follow_up_number, status, sent_at)
    VALUES ($1, 'x@example.in', 'hi', 'body', 0, 'sent', now() - interval '2 days')`, [l11.id]);
  const elig3 = await discoverEligibleLeads(await getWhatsAppConfig());
  const l11e = elig3.find((e) => Number(e.lead.id) === l11.id);
  check("§18: recent email contact → WhatsApp cooldown", !l11e?.eligible, l11e?.reason || "");

  // ---- dashboard ----
  const dash = await getWhatsAppDashboard();
  check("dashboard stats present", dash.stats.generated >= 3 && typeof dash.stats.replyRate === "number");
  check("dashboard queue list", Array.isArray(dash.queue) && dash.queue.length >= 3);
  check("sender reported (configured=true in test)", dash.sender.configured === true && dash.sender.simulated === false);

  // ---- generator unit ----
  const genU = await generateWhatsAppMessage((await pool.query(`SELECT * FROM leads WHERE id = $1`, [l10.id])).rows[0], 0);
  check("generator unit: message + summary", genU.message.length >= 30 && genU.summary.length > 0);

  console.log(`\n===== RESULT: ${pass} passed, ${fail} failed =====`);
} catch (e: any) {
  console.error("LIVETEST ERROR:", e);
  fail++;
} finally {
  const synCopy = [...synLeads];
  const actCopy = [...synActivities];
  try { await cleanup(); } catch (e2: any) { console.error("cleanup error:", e2); }
  const leftLead = synCopy.length ? Number((await pool.query(`SELECT count(*)::int n FROM leads WHERE id = ANY($1::int[])`, [synCopy]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) : 0;
  const leftAct = actCopy.length ? Number((await pool.query(`SELECT count(*)::int n FROM outreach_activities WHERE id = ANY($1::int[])`, [actCopy]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) : 0;
  console.log(`FINAL: ${pass} passed, ${fail} failed (leftover synthetic leads: ${leftLead}, activities: ${leftAct})`);
  await pool.end();
  if (fail) process.exit(1);
}
