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
  ok("same-stage ok", canTransition("engaged", "engaged"));
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

  await pool.end();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
