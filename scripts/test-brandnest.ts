// BrandNest Studio tests: unified contacts, ledger, revenue split, conversion,
// reactivation, automation guards (live DB, cleaned up).
// Run: npx tsx scripts/test-brandnest.ts   (needs DATABASE_URL)
import { pool } from "@/db";
import { ensureBrandNestSchema } from "@/lib/brandnest/schema";
import { upsertBrandNestClient, getBrandNestClient, listBrandNestClients } from "@/lib/brandnest/clients";
import { createProject, updateProject } from "@/lib/brandnest/projects";
import { convertToVyravo } from "@/lib/brandnest/convert";
import { getBrandNestMetrics, getRevenueSplit } from "@/lib/brandnest/metrics";
import { suggestReactivation, setReactivation, createReactivationTask } from "@/lib/brandnest/reactivate";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

async function main() {
  await ensureBrandNestSchema();
  const tag = `bn${Date.now()}`;
  const email = `${tag}@example.com`;

  console.log("existing data untouched");
  {
    const r = await pool.query(`SELECT COALESCE(business_source,'vyravo_ai') b FROM leads WHERE id = 402`);
    ok("lead 402 still vyravo_ai", r.rows[0]?.b === "vyravo_ai");
  }

  console.log("unified contacts (dedupe)");
  const c1 = await upsertBrandNestClient({ name: `BN Test ${tag}`, company: `TestCo ${tag}`, email, phone: "+91 98000 11111", notes: "first" });
  ok("client created as brandnest", c1.created);
  const biz = (await pool.query(`SELECT business_source, stage, status, source FROM leads WHERE id = $1`, [c1.leadId])).rows[0];
  ok("business/stage/source", biz.business_source === "brandnest" && biz.stage === "new" && biz.source === "brandnest", JSON.stringify(biz));
  const c2 = await upsertBrandNestClient({ name: "Different Name", company: "OtherCo", email, notes: "second" });
  ok("same email → same lead, no duplicate", !c2.created && c2.leadId === c1.leadId);
  const kept = (await pool.query(`SELECT business_name FROM leads WHERE id = $1`, [c1.leadId])).rows[0];
  ok("no overwrite with newer/older data", kept.business_name === `TestCo ${tag}`);
  const q = await pool.query(`SELECT count(*)::int n FROM outreach_events WHERE lead_id = $1`, [c1.leadId]);
  ok("nothing queued on create", q.rows[0].n === 0);

  console.log("project ledger + repeat detection");
  const splitBefore = await getRevenueSplit();
  const p1 = await createProject({ leadId: c1.leadId, service: "Poster Design", amount: 200, status: "pending" });
  await updateProject(p1.id, { status: "paid", paymentMethod: "UPI" });
  const p2 = await createProject({ leadId: c1.leadId, service: "Logo Refresh", amount: 5000, status: "paid", paymentMethod: "UPI" });
  ok("two projects recorded", p1.id > 0 && p2.id > 0);
  const agg = await getBrandNestClient(c1.leadId);
  ok("aggregates live", agg.project_count === 2 && Number(agg.total_revenue) === 5200, `${agg.project_count}/${agg.total_revenue}`);
  ok("repeat client auto-detected", agg.relationship_status === "repeat_client", agg.relationship_status);
  const esc = await pool.query(`SELECT kind FROM sales_escalations WHERE lead_id = $1 AND kind LIKE 'brandnest%'`, [c1.leadId]);
  const kinds = esc.rows.map((r: any) => r.kind);
  ok("payment + repeat notifications", kinds.includes("brandnest_payment") && kinds.includes("brandnest_repeat"), kinds.join(","));
  const splitAfter = await getRevenueSplit();
  ok("brandnest revenue separated", splitAfter.brandnest - splitBefore.brandnest === 5200, `${splitBefore.brandnest}→${splitAfter.brandnest}`);
  ok("vyravo revenue untouched", splitAfter.vyravo === splitBefore.vyravo);
  ok("combined = explicit sum", splitAfter.combined === splitAfter.vyravo + splitAfter.brandnest);

  console.log("automation guards");
  {
    const { getOutreachConfig } = await import("@/lib/outreach/config");
    const { discoverNewLeads, sendOutreachNow } = await import("@/lib/outreach/pipeline");
    const cfg = await getOutreachConfig();
    const found = await discoverNewLeads({ ...cfg, min_score: 0 });
    ok("cold discovery excludes brandnest", !found.some((l: any) => Number(l.id) === c1.leadId));
    const manual = await sendOutreachNow(c1.leadId);
    ok("manual cold send blocked", !manual.ok, manual.error || "");
    const rc = await pool.query(
      `SELECT id FROM leads WHERE (stage IN ('new','READY_FOR_OUTREACH') OR stage IS NULL)
       AND COALESCE(business_source,'vyravo_ai') IN ('vyravo_ai','brandnest_to_vyravo') AND id = $1`, [c1.leadId]);
    ok("research excludes brandnest", (rc.rowCount ?? 0) === 0);
  }

  console.log("reactivation (tasks, never auto-send)");
  {
    const s = await suggestReactivation(c1.leadId);
    ok("suggestion ready (paid history)", s.suggestion === "ready", `${s.suggestion}: ${s.reasons.join(";")}`);
    await setReactivation(c1.leadId, "ready");
    const t = await createReactivationTask(c1.leadId, "test task");
    ok("follow-up task created", t.id > 0);
    const st = (await pool.query(`SELECT reactivation_status FROM brandnest_clients WHERE lead_id = $1`, [c1.leadId])).rows[0];
    ok("task → active", st.reactivation_status === "active");
    const q2 = await pool.query(`SELECT count(*)::int n FROM outreach_events WHERE lead_id = $1`, [c1.leadId]);
    const mail = await pool.query(`SELECT count(*)::int n FROM email_queue WHERE lead_id = $1`, [c1.leadId]);
    ok("reactivation queued/sent nothing", q2.rows[0].n === 0 && mail.rows[0].n === 0);
  }

  console.log("conversion (warm, no duplication)");
  {
    const r = await convertToVyravo(c1.leadId, { categories: ["WhatsApp Automation"], opportunity: "high", note: "test" });
    ok("converted", !r.already);
    const after = (await pool.query(`SELECT business_source, stage FROM leads WHERE id = $1`, [c1.leadId])).rows[0];
    ok("business flipped, stage kept", after.business_source === "brandnest_to_vyravo" && after.stage === "new", JSON.stringify(after));
    const bn = (await pool.query(`SELECT relationship_status, vyravo_opportunity FROM brandnest_clients WHERE lead_id = $1`, [c1.leadId])).rows[0];
    ok("brandnest history preserved", bn.relationship_status === "converted_to_vyravo" && bn.vyravo_opportunity === "high");
    const q3 = await pool.query(`SELECT count(*)::int n FROM outreach_events WHERE lead_id = $1`, [c1.leadId]);
    ok("conversion queued nothing", q3.rows[0].n === 0);
    const again = await convertToVyravo(c1.leadId, {});
    ok("convert idempotent", again.already);
    const { getOutreachConfig } = await import("@/lib/outreach/config");
    const { discoverNewLeads } = await import("@/lib/outreach/pipeline");
    const found = await discoverNewLeads({ ...(await getOutreachConfig()), min_score: 0 });
    ok("converted still excluded from cold auto", !found.some((l: any) => Number(l.id) === c1.leadId));
  }

  console.log("metrics + list filters");
  {
    const m = await getBrandNestMetrics();
    ok("dashboard metrics", m.clients.total >= 1 && m.revenue.total >= 5200);
    const byQ = await listBrandNestClients({ q: `TestCo ${tag}` });
    ok("list search finds client", byQ.some((r: any) => Number(r.id) === c1.leadId));
    const byOpp = await listBrandNestClients({ opportunity: "high" });
    ok("opportunity filter", byOpp.some((r: any) => Number(r.id) === c1.leadId));
  }

  console.log("revenue edit (ledger correction)");
  {
    await updateProject(p2.id, { amount: 6000 });
    const agg2 = await getBrandNestClient(c1.leadId);
    ok("edited amount recomputes revenue", Number(agg2.total_revenue) === 6200, String(agg2.total_revenue));
    await pool.query(`UPDATE leads SET business_name = $2 WHERE id = $1`, [c1.leadId, `EditedCo ${tag}`]);
    const ed = (await pool.query(`SELECT business_name FROM leads WHERE id = $1`, [c1.leadId])).rows[0];
    ok("client edit persists", ed.business_name === `EditedCo ${tag}`);
  }

  console.log("cleanup");
  {
    await pool.query(`DELETE FROM brandnest_projects WHERE lead_id = $1`, [c1.leadId]);
    await pool.query(`DELETE FROM brandnest_clients WHERE lead_id = $1`, [c1.leadId]);
    await pool.query(`DELETE FROM sales_escalations WHERE lead_id = $1`, [c1.leadId]);
    await pool.query(`DELETE FROM sales_decisions WHERE lead_id = $1`, [c1.leadId]);
    await pool.query(`DELETE FROM activities WHERE lead_id = $1`, [c1.leadId]);
    await pool.query(`DELETE FROM leads WHERE id = $1`, [c1.leadId]);
    const gone = await pool.query(`SELECT count(*)::int n FROM leads WHERE email = $1`, [email]);
    ok("test data cleaned", gone.rows[0].n === 0);
    const split = await getRevenueSplit();
    ok("brandnest revenue back to baseline", split.brandnest === splitBefore.brandnest, `${split.brandnest} vs ${splitBefore.brandnest}`);
  }

  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  await pool.end();
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error("FATAL", e); try { await pool.end(); } catch {} process.exit(1); });
