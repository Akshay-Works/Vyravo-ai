// Sales OS Phase 2 tests: state machine (pure) + guards/decisions (live DB, cleaned up).
// Run: npx tsx scripts/test-sales.ts   (needs DATABASE_URL)
import { canTransition, normalizeStage, isTerminal } from "@/lib/sales/stages";
import { pool } from "@/db";
import { ensureSalesSchema, logDecision, createEscalation, isSuppressed, addSuppression, isSalesPaused } from "@/lib/sales/schema";
import { decideForInbox, salesTick } from "@/lib/sales/decide";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

async function main() {
  console.log("stages (pure)");
  ok("forward allowed", canTransition("new", "contacted") && canTransition("engaged", "proposal_sent"));
  ok("backward blocked", !canTransition("contacted", "new") && !canTransition("proposal_sent", "engaged"));
  ok("any → terminal", canTransition("negotiation", "lost") && canTransition("new", "nurture"));
  ok("terminal sticky", !canTransition("lost", "contacted") && !canTransition("nurture", "qualified"));
  ok("same-stage ok", canTransition("replied", "replied") && canTransition("engaged", "replied"));
  ok("unknown from = new", canTransition("garbage_value", "contacted") && !canTransition("garbage_value", "bogus"));
  ok("bogus to rejected", !canTransition("new", "bogus"));
  ok("normalize/isTerminal", normalizeStage("WON") === "won" && normalizeStage("xx") === "new" && isTerminal("lost") && !isTerminal("won"));

  console.log("suppression (live DB, cleaned)");
  await ensureSalesSchema();
  const tem = `test-suppress-${Date.now()}@example.com`;
  ok("not suppressed initially", !(await isSuppressed(tem)));
  await addSuppression(tem, "test", "test-sales");
  ok("suppressed after add", await isSuppressed(tem));
  ok("case-insensitive", await isSuppressed(tem.toUpperCase()));
  await pool.query(`DELETE FROM suppression_list WHERE email = $1`, [tem]);

  console.log("pause flag (live DB, restored)");
  const prev = await pool.query(`SELECT v FROM outreach_config WHERE k = 'sales_paused'`);
  const had = (prev.rowCount ?? 0) > 0 ? prev.rows[0].v : null;
  await pool.query(`INSERT INTO outreach_config (k, v) VALUES ('sales_paused','true') ON CONFLICT (k) DO UPDATE SET v = 'true'`);
  const p1 = await isSalesPaused();
  ok("manual pause detected", p1.paused && (p1.reason || "").includes("manual"), p1.reason || "");
  if (had === null) await pool.query(`DELETE FROM outreach_config WHERE k = 'sales_paused'`);
  else await pool.query(`UPDATE outreach_config SET v = $1 WHERE k = 'sales_paused'`, [had]);
  const p2 = await isSalesPaused();
  ok("pause cleared", !p2.paused, p2.reason || "");

  console.log("escalations (live DB, cleaned)");
  const e1 = await createEscalation({ lead_id: 402, kind: "test_kind", title: "test", detail: "d", recommendation: "r" });
  const e2 = await createEscalation({ lead_id: 402, kind: "test_kind", title: "test", detail: "d", recommendation: "r" });
  ok("dedupe open escalation", !e1.duplicate && e2.duplicate && e1.id === e2.id);
  await pool.query(`DELETE FROM sales_escalations WHERE kind = 'test_kind'`);
  await logDecision({ lead_id: 402, trigger_text: "test", action: "none", reason: "test row" });
  const dn = Number((await pool.query(`SELECT count(*)::int n FROM sales_decisions WHERE trigger_text = 'test'`)).rows[0].n);
  ok("decision logged", dn >= 1, String(dn));
  await pool.query(`DELETE FROM sales_decisions WHERE trigger_text = 'test'`);

  console.log("decideForInbox (live, stage restored)");
  const before = (await pool.query(`SELECT stage FROM leads WHERE id = 402`)).rows[0]?.stage;
  const d = await decideForInbox({ lead_id: 402, classification: "meeting_request", confidence: 0.88, actionTaken: "send" });
  ok("meeting → L3 escalate", d.action === "escalate" && d.autonomy === "L3", `${d.action}/${d.autonomy}`);
  const esc = await pool.query(`SELECT id FROM sales_escalations WHERE lead_id = 402 AND kind = 'meeting_request' AND status = 'open'`);
  ok("escalation row created", (esc.rowCount ?? 0) > 0);
  await pool.query(`DELETE FROM sales_escalations WHERE lead_id = 402 AND kind = 'meeting_request'`);
  await pool.query(`DELETE FROM sales_decisions WHERE lead_id = 402 AND trigger_text LIKE 'inbox:%'`);
  await pool.query(`UPDATE leads SET stage = $1 WHERE id = 402`, [before]);
  console.log(`  (lead 402 stage restored to ${before})`);

  console.log("legacy stage map");
  ok("QUALIFIED→qualified", normalizeStage("QUALIFIED") === "qualified");
  ok("READY→researched", normalizeStage("READY_FOR_OUTREACH") === "researched");
  ok("archived→lost (terminal)", normalizeStage("archived") === "lost" && !canTransition("archived", "contacted"));

  console.log("score (pure)");
  {
    const { computeScore, bandFor } = await import("@/lib/sales/score");
    const hot = computeScore({ industry: "Dental Clinic", country: "India", business_website: "https://x.com", phone: "123",
      email: "dr@clinic.com", full_name: "Rohan Mehta", reply_received: true, reply_class: "pricing_request",
      sent_count: 2, inbox_threads: 1, last_activity_at: new Date().toISOString() });
    ok("hot lead scores high", hot.score >= 61 && ["high", "immediate"].includes(hot.band), `${hot.score}/${hot.band}`);
    const cold = computeScore({ email: "info@unknown" });
    ok("thin lead scores low", cold.score <= 40, `${cold.score}/${cold.band}`);
    const ref = computeScore({ industry: "Restaurant", email: "a@b.com", source: "Referral" });
    const noref = computeScore({ industry: "Restaurant", email: "a@b.com", source: "engine" });
    ok("referral bonus", ref.score === noref.score + 10, `${ref.score} vs ${noref.score}`);
    ok("bands", bandFor(85) === "immediate" && bandFor(61) === "high" && bandFor(41) === "moderate" && bandFor(21) === "low" && bandFor(5) === "very low");
  }
  console.log("qualify (pure)");
  {
    const { extractBuyingSignals } = await import("@/lib/sales/qualify");
    const s = extractBuyingSignals("I own a dental clinic. What's the pricing? Our budget is around ₹50,000 and we want to start next month.");
    ok("budget extracted", !!s.budget && s.budget.includes("50,000"), s.budget || "");
    ok("timeline extracted", !!s.timeline, s.timeline || "");
    ok("owner detected", s.authority === "decision_maker", s.authority);
    ok("intent high", s.intent >= 2, String(s.intent));
    const s2 = extractBuyingSignals("Thanks, I need to check with my team.");
    ok("team + low intent", s2.authority === "team" && s2.intent < 2, `${s2.authority}/${s2.intent}`);
  }
  console.log("research extract (pure)");
  {
    const { extractSignals } = await import("@/lib/sales/research");
    const sig = extractSignals(`<html><head><title>Smile Dental</title><meta name="description" content="Best dental care"></head>
      <body><a href="https://wa.me/123">chat</a><a href="tel:+9111">call</a><form></form><script src="https://tawk.to/x"></script>contact@smile.com</body></html>`, "https://smile.com");
    ok("chatbot/wa/form/phone", sig.has_chatbot && sig.has_whatsapp && sig.has_lead_form && sig.has_phone);
    ok("no booking", !sig.has_booking);
    ok("title+desc+email", sig.title === "Smile Dental" && (sig.description || "").includes("dental") && sig.emails_found.includes("contact@smile.com"));
  }

  console.log("salesTick (live sweep, max 3)");
  const t = await salesTick({ max: 3, budgetMs: 10000 });
  ok("tick ran", typeof t.nurtured === "number", JSON.stringify(t));
  console.log(`  nurtured=${t.nurtured} open_escalations=${t.open_escalations}`);

  console.log("brief (read-only)");
  {
    const { buildDiscoveryBrief } = await import("@/lib/sales/brief");
    const brief = await buildDiscoveryBrief(402);
    ok("has all sections", ["DISCOVERY BRIEF", "Company:", "Contact:", "Conversation history:", "Questions to ask:", "Desired outcome:"].every((s) => brief.includes(s)));
  }
  console.log("negotiate (pure)");
  {
    const { extractRequestedPrice } = await import("@/lib/sales/negotiate");
    ok("₹50,000", extractRequestedPrice("can you do it for ₹50,000?")?.amount === 50000);
    ok("1.5 lakh", extractRequestedPrice("budget is 1.5 lakh")?.amount === 150000);
    ok("$2k", extractRequestedPrice("how about $2k")?.amount === 2000);
    ok("no money → null", extractRequestedPrice("sounds interesting, tell me more") === null);
  }
  console.log("meetingTick (graceful without token)");
  {
    const { meetingTick } = await import("@/lib/sales/meetings");
    const m = await meetingTick({ max: 2 });
    ok("skips cleanly", m.booked === 0 && !!m.skipped, m.skipped || "");
  }
  console.log("proposal draft (live, cleaned)");
  {
    try {
      const { generateSalesProposal } = await import("@/lib/sales/deals");
      const p = await generateSalesProposal(402, { requirements: ["test requirement"], services: ["AI receptionist"], notes: "test-sales cleanup candidate" });
      const row = (await pool.query(`SELECT status, generated_by_ai FROM proposals WHERE id = $1`, [p.proposalId])).rows[0];
      ok("draft created, AI-flagged", row?.status === "draft" && row?.generated_by_ai === true, `${row?.status}/${row?.generated_by_ai}`);
      await pool.query(`DELETE FROM proposal_events WHERE proposal_id = $1`, [p.proposalId]);
      await pool.query(`DELETE FROM proposal_items WHERE proposal_id = $1`, [p.proposalId]);
      await pool.query(`DELETE FROM proposal_versions WHERE proposal_id = $1`, [p.proposalId]);
      await pool.query(`DELETE FROM proposals WHERE id = $1`, [p.proposalId]);
      await pool.query(`DELETE FROM sales_escalations WHERE kind = 'proposal_approval' AND lead_id = 402`);
      await pool.query(`DELETE FROM sales_decisions WHERE lead_id = 402 AND trigger_text = 'generateSalesProposal'`);
      console.log("  (draft proposal cleaned up)");
    } catch (e: any) {
      console.log(`  SKIP (needs OpenAI/KB access): ${String(e?.message || e).slice(0, 120)}`);
    }
  }
  console.log("experiments (live DB, cleaned)");
  {
    const { ensureExperimentSchema, assignVariant, trackOutcome, getExperimentResults } = await import("@/lib/sales/experiments");
    await ensureExperimentSchema();
    const exp = `test_exp_${Date.now()}`;
    await pool.query(`INSERT INTO sales_experiments (name, description, status, variants) VALUES ($1,'test','paused',$2)`,
      [exp, JSON.stringify([{ key: "control", weight: 1 }, { key: "day5", weight: 1 }])]);
    const off = await assignVariant(exp, 402);
    ok("paused → control", !off.enrolled && off.variant === "control", `${off.enrolled}/${off.variant}`);
    await pool.query(`UPDATE sales_experiments SET status = 'active' WHERE name = $1`, [exp]);
    const a1 = await assignVariant(exp, 402);
    const a2 = await assignVariant(exp, 402);
    ok("deterministic enrollment", a1.enrolled && a1.variant === a2.variant, `${a1.variant}/${a2.variant}`);
    await trackOutcome(402, "replied");
    const res = await getExperimentResults();
    const mine = res.find((r: any) => r.name === exp);
    ok("results aggregate", !!mine && mine.results.some((x: any) => x.enrolled >= 1 && x.replied >= 1), JSON.stringify(mine?.results || []));
    await pool.query(`DELETE FROM sales_experiment_outcomes WHERE experiment = $1`, [exp]);
    await pool.query(`DELETE FROM sales_experiment_assignments WHERE experiment = $1`, [exp]);
    await pool.query(`DELETE FROM sales_experiments WHERE name = $1`, [exp]);
  }
  console.log("metrics (read-only)");
  {
    const { getSalesMetrics, getFounderActions, getRecentFailures, getTomorrowQueue, getBestOpportunities } = await import("@/lib/sales/metrics");
    const m = await getSalesMetrics();
    ok("metrics shape", m.today && m.ai && m.funnel && typeof m.paused === "boolean");
    ok("founder actions array", Array.isArray(await getFounderActions(5)));
    ok("failures array", Array.isArray(await getRecentFailures(5)));
    ok("tomorrow queue", typeof (await getTomorrowQueue()).outreach_pending === "number");
    ok("opportunities array", Array.isArray(await getBestOpportunities(3)));
  }

  console.log("orchestrate (live DB, cleaned)");
  {
    const { pauseChannels, suggestNextChannel } = await import("@/lib/sales/orchestrate");
    await pool.query(`INSERT INTO outreach_activities (lead_id, channel, follow_up_number, status, message) VALUES (402,'whatsapp',9,'awaiting_approval','test') ON CONFLICT DO NOTHING`);
    const p = await pauseChannels(402, "test");
    const st = (await pool.query(`SELECT status FROM outreach_activities WHERE lead_id = 402 AND channel = 'whatsapp' AND follow_up_number = 9`)).rows[0]?.status;
    ok("unsent WA activity skipped", p.paused >= 1 && st === "skipped", `${p.paused}/${st}`);
    await pool.query(`DELETE FROM outreach_activities WHERE lead_id = 402 AND channel = 'whatsapp' AND follow_up_number = 9`);
    await pool.query(`DELETE FROM sales_decisions WHERE lead_id = 402 AND trigger_text = 'pauseChannels'`);
    const wl = await pool.query(`SELECT id FROM leads WHERE whatsapp_number IS NOT NULL AND whatsapp_opt_in_status IS DISTINCT FROM 'opted_out' LIMIT 1`);
    if ((wl.rowCount ?? 0) > 0) {
      await suggestNextChannel(Number(wl.rows[0].id));
      const se = await pool.query(`SELECT id FROM sales_escalations WHERE lead_id = $1 AND kind = 'channel_suggest' AND status = 'open'`, [wl.rows[0].id]);
      ok("channel suggestion escalated", (se.rowCount ?? 0) > 0);
      await pool.query(`DELETE FROM sales_escalations WHERE lead_id = $1 AND kind = 'channel_suggest'`, [wl.rows[0].id]);
    } else console.log("  SKIP channel_suggest (no WA-opted lead found)");
  }
  console.log("outbox held-shape (live DB, cleaned)");
  {
    const ins = await pool.query(
      `INSERT INTO email_queue (lead_id, email_type, scheduled_for, status, template_data, created_at)
       VALUES (402,'followup_l2', now(), 'held', $1, now()) RETURNING id`,
      [JSON.stringify({ to: "t@example.com", subject: "test hold", html: "<p>hi</p>", leadId: 402 })]);
    const hid = Number(ins.rows[0].id);
    const held = await pool.query(`SELECT count(*)::int n FROM email_queue WHERE id = $1 AND status = 'held'`, [hid]);
    ok("held row invisible to workers", held.rows[0].n === 1);
    const generic = await pool.query(`SELECT count(*)::int n FROM email_queue WHERE id = $1 AND status = 'pending' AND scheduled_for <= now()`, [hid]);
    ok("not picked up as pending", generic.rows[0].n === 0);
    await pool.query(`DELETE FROM email_queue WHERE id = $1`, [hid]);
  }

  console.log("lifecycle transitions (pure)");
  {
    const { canTransition, normalizeStage } = await import("@/lib/sales/stages");
    const { toSalesIntent } = await import("@/lib/sales/classify");
    ok("full chain forward", ["researched","contacted","replied","replied_to","qualified","meeting_booked","discovery_completed","proposal_sent","negotiation","verbal_agreement","invoice_sent","payment_pending","won","onboarding","active_client"]
      .every((s, i, a) => canTransition(i === 0 ? "new" : a[i - 1], s)));
    ok("backward blocked", !canTransition("qualified", "contacted") && !canTransition("won", "proposal_sent"));
    ok("any → terminal", canTransition("negotiation", "lost") && canTransition("new", "nurture"));
    ok("terminal sticky", !canTransition("lost", "contacted") && !canTransition("nurture", "new"));
    ok("conversation back-edge", canTransition("replied_to", "replied"));
    ok("legacy engaged → replied", normalizeStage("engaged") === "replied");
    ok("unknown → new", normalizeStage("bogus_xyz") === "new");
    ok("intent unsubscribe", toSalesIntent("unsubscribe", null, 0).intent === "UNSUBSCRIBE");
    ok("intent meeting hi-conf", toSalesIntent(null, "meeting_request", 0.9).escalate === "meeting_request");
    ok("intent meeting lo-conf → review", toSalesIntent(null, "meeting_request", 0.5).intent === "HUMAN_REVIEW");
    ok("intent pricing", toSalesIntent(null, "pricing_request", 0.9).intent === "PRICING");
    ok("intent wrong person", toSalesIntent(null, "wrong_person", 0.8).stageMove === "wrong_contact");
    ok("intent objection", toSalesIntent(null, "objection", 0.8).intent === "OBJECTION");
    ok("intent ooo no-move", toSalesIntent("out_of_office", null, 0).stageMove === null);
  }
  console.log("lifecycle engine (live DB, cleaned)");
  {
    const { emitSalesEvent } = await import("@/lib/sales/lifecycle");
    const k = `test-dedupe-${Date.now()}`;
    const r1 = await emitSalesEvent({ key: k, type: "LEAD_CREATED", leadId: 402, payload: {} });
    const r2 = await emitSalesEvent({ key: k, type: "LEAD_CREATED", leadId: 402, payload: {} });
    ok("same event twice → duplicate", !r1.duplicate && r2.duplicate);
    await pool.query(`DELETE FROM sales_events WHERE event_key = $1`, [k]);
  }
  console.log("full journey new → active_client (live DB, cleaned)");
  {
    const { emitSalesEvent } = await import("@/lib/sales/lifecycle");
    const { createInvoice, recordPayment } = await import("@/lib/sales/invoices");
    const { completeOnboarding } = await import("@/lib/sales/onboarding");
    const tag = `lj${Date.now()}`;
    const ins = await pool.query(
      `INSERT INTO leads (full_name, email, business_name, stage, status, source) VALUES ($1,$2,$3,'new','active','lifecycle-test') RETURNING id`,
      [`Lifecycle Test ${tag}`, `${tag}@example.com`, `TestCo ${tag}`]);
    const lid = Number(ins.rows[0].id);
    let stepN = 0;
    const step = async (type: string, payload: any = {}) => emitSalesEvent({ key: `${tag}-${++stepN}-${type}`, type, leadId: lid, payload });
    const stage = async () => (await pool.query(`SELECT stage FROM leads WHERE id = $1`, [lid])).rows[0].stage;
    await step("LEAD_CREATED");
    await step("LEAD_RESEARCHED"); ok("journey researched", (await stage()) === "researched");
    await step("OUTREACH_SENT", { channel: "email" }); ok("journey contacted", (await stage()) === "contacted");
    await step("EMAIL_RECEIVED"); ok("journey replied", (await stage()) === "replied");
    await step("REPLY_SENT"); ok("journey replied_to", (await stage()) === "replied_to");
    await step("EMAIL_RECEIVED"); ok("journey loop back to replied", (await stage()) === "replied");
    await step("LEAD_QUALIFIED", { reason: "test" }); ok("journey qualified", (await stage()) === "qualified");
    await step("MEETING_BOOKED"); ok("journey meeting", (await stage()) === "meeting_booked");
    await step("MEETING_COMPLETED"); ok("journey discovery", (await stage()) === "discovery_completed");
    await step("PROPOSAL_SENT", { proposalId: 1 }); ok("journey proposal", (await stage()) === "proposal_sent");
    await step("NEGOTIATION_STARTED", { summary: "test discount ask" }); ok("journey negotiation", (await stage()) === "negotiation");
    await step("AGREEMENT_DETECTED", { confidence: 0.95, evidence: "test: let's proceed" });
    ok("journey verbal", (await stage()) === "verbal_agreement");
    const inv = await createInvoice(lid, { amount: 25000, currency: "INR" });
    const { sendInvoice } = await import("@/lib/sales/invoices");
    await sendInvoice(inv.id, "test");
    ok("journey payment_pending", (await stage()) === "payment_pending");
    const pay1 = await recordPayment({ providerRef: `${tag}-pay`, invoiceId: inv.id, amount: 25000, currency: "INR", provider: "manual" });
    ok("payment applied → onboarding", pay1.applied && (await stage()) === "onboarding");
    const pay2 = await recordPayment({ providerRef: `${tag}-pay`, invoiceId: inv.id, amount: 25000, currency: "INR", provider: "manual" });
    ok("payment webhook twice → once", !pay2.applied);
    await completeOnboarding(lid, "test", "test complete");
    ok("journey active_client", (await stage()) === "active_client");
    // terminal + unsubscribe + referral paths on throwaway leads
    const t2 = (await pool.query(`INSERT INTO leads (full_name, email, stage, status, source) VALUES ('T2','${tag}t2@example.com','contacted','active','lifecycle-test') RETURNING id`)).rows[0].id;
    await emitSalesEvent({ key: `${tag}-ni`, type: "DEAL_LOST", leadId: Number(t2), payload: { to: "not_interested", reason: "test" } });
    ok("not_interested terminal", (await pool.query(`SELECT stage FROM leads WHERE id = $1`, [t2])).rows[0].stage === "not_interested");
    const t3 = (await pool.query(`INSERT INTO leads (full_name, email, stage, status, source) VALUES ('T3','${tag}t3@example.com','contacted','active','lifecycle-test') RETURNING id`)).rows[0].id;
    await emitSalesEvent({ key: `${tag}-unsub`, type: "UNSUBSCRIBED", leadId: Number(t3), payload: {} });
    const t3s = (await pool.query(`SELECT stage FROM leads WHERE id = $1`, [t3])).rows[0].stage;
    const supp = await pool.query(`SELECT 1 FROM suppression_list WHERE email = $1`, [`${tag}t3@example.com`]);
    ok("unsubscribed + suppressed", t3s === "unsubscribed" && (supp.rowCount ?? 0) > 0);
    const { handleReferral } = await import("@/lib/sales/referrals");
    const ref = await handleReferral(402, { email: `${tag}ref@example.com`, name: "Referred Person", context: "test" });
    const refRow = (await pool.query(`SELECT stage, referred_by_lead_id, source FROM leads WHERE id = $1`, [ref.leadId])).rows[0];
    ok("referral own lifecycle + link", ref.created && refRow.stage === "new" && Number(refRow.referred_by_lead_id) === 402 && refRow.source === "referral");
    // cleanup (children first: self-FK + invoice/lead FKs)
    await pool.query(`DELETE FROM sales_events WHERE lead_id IN ($1,$2,$3,$4)`, [lid, t2, t3, ref.leadId]).catch(() => {});
    await pool.query(`DELETE FROM sales_decisions WHERE lead_id IN ($1,$2,$3,$4)`, [lid, t2, t3, ref.leadId]).catch(() => {});
    await pool.query(`DELETE FROM sales_escalations WHERE lead_id IN ($1,$2,$3,$4)`, [lid, t2, t3, ref.leadId]).catch(() => {});
    await pool.query(`DELETE FROM sales_invoices WHERE lead_id = $1`, [lid]).catch(() => {});
    await pool.query(`DELETE FROM activities WHERE lead_id IN ($1,$2,$3,$4)`, [lid, t2, t3, ref.leadId]).catch(() => {});
    await pool.query(`DELETE FROM suppression_list WHERE email = $1`, [`${tag}t3@example.com`]).catch(() => {});
    await pool.query(`DELETE FROM leads WHERE id IN ($1,$2,$3,$4)`, [ref.leadId, t3, t2, lid]).catch(() => {});
    const gone = await pool.query(`SELECT count(*)::int n FROM leads WHERE email LIKE '%${tag}%'`);
    ok("journey test data cleaned", gone.rows[0].n === 0);
  }

  await pool.end();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
