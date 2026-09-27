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

  console.log("salesTick (live sweep, max 3)");
  const t = await salesTick({ max: 3, budgetMs: 10000 });
  ok("tick ran", typeof t.nurtured === "number", JSON.stringify(t));
  console.log(`  nurtured=${t.nurtured} open_escalations=${t.open_escalations}`);

  await pool.end();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
