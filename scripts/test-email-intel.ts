// Email-intel scenario tests (spec §14 + §17): pure layers + DB idempotency.
// LLM outputs are FIXTURES (validating the safety router's judgment, not the
// model). Live-LLM verification happens post-deploy in draft-safe mode.
// Run: npx tsx scripts/test-email-intel.ts   (needs DATABASE_URL for §F)
import { decideAction, type SafetyContext } from "@/lib/email-intel/safety";
import { extractEmails, extractPhones, threadRoot, splitAddr, isSystemAddress } from "@/lib/email-intel/extract";
import type { IntelAnalysis } from "@/lib/email-intel/llm";
import { pool } from "@/db";
import { ensureInboxSchema } from "@/lib/email-intel/schema";
import { syncInboundMessage } from "@/lib/email-intel/process";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};
const base: SafetyContext = {
  tier0: "unknown", llm: null, autoReplyOn: true, threadAutoOn: true,
  sentToday: 0, dailyCap: 25, threadAutoSent7d: 0, minConf: 0.9, reviewAt: 0.75,
  recipientKnown: true, isSelf: false,
};
const llm = (p: Partial<IntelAnalysis>): IntelAnalysis => ({
  classification: "general", confidence: 0.9, reply_required: true, sender_is_lead: true,
  is_referral: false, new_contact_recommended: false, entities: [],
  draft: { subject: "Re: hello", body: "Thanks for writing — this is a sufficiently long test draft body for validation." },
  safety_flags: [], explanation: "test",
  ...p,
});

async function main() {
  console.log("A: positive reply → auto-send");
  {
    const d = decideAction({ ...base, tier0: "positive", llm: llm({ classification: "positive_interest", confidence: 0.93 }) });
    ok("action=send", d.action === "send", d.action);
  }
  console.log("B: referral → send + contact referred");
  {
    const d = decideAction({ ...base, tier0: "question", llm: llm({
      classification: "referral", confidence: 0.92, is_referral: true, new_contact_recommended: true,
      entities: [{ email: "boss@example.com", name: "Boss", title: null, company: null, phone: null, linkedin: null, relationship: "decision maker", reason: "sender reports to them", confidence: 0.93, recommended_action: "contact" }],
    }) });
    ok("action=send", d.action === "send", d.action);
    ok("contact routed to contact", d.contacts[0]?.action === "contact", d.contacts[0]?.action);
  }
  console.log("C: multiple emails → per-entity routing");
  {
    const d = decideAction({ ...base, llm: llm({ classification: "introduction", confidence: 0.91,
      entities: [
        { email: "a@example.com", name: null, title: null, company: null, phone: null, linkedin: null, relationship: null, reason: "referred", confidence: 0.95, recommended_action: "contact" },
        { email: "b@example.com", name: null, title: null, company: null, phone: null, linkedin: null, relationship: null, reason: "cc", confidence: 0.8, recommended_action: "review" },
        { email: "c@example.com", name: null, title: null, company: null, phone: null, linkedin: null, relationship: null, reason: "signature", confidence: 0.4, recommended_action: "ignore" },
      ] }) });
    ok("contact/review/ignore split",
      d.contacts.map((x) => x.action).join(",") === "contact,review,ignore",
      d.contacts.map((x) => x.action).join(","));
  }
  console.log("D: unsubscribe → DNC, NEVER reply");
  {
    const d = decideAction({ ...base, tier0: "unsubscribe", llm: null });
    ok("action=unsubscribe", d.action === "unsubscribe", d.action);
    const d2 = decideAction({ ...base, tier0: "unknown", llm: llm({ classification: "unsubscribe", confidence: 0.99, reply_required: false, draft: null }) });
    ok("AI-detected unsubscribe too", d2.action === "unsubscribe", d2.action);
  }
  console.log("E: ambiguous → human review");
  {
    const d = decideAction({ ...base, llm: llm({ classification: "general", confidence: 0.6 }) });
    ok("action=needs_review", d.action === "needs_review", d.action);
    const d2 = decideAction({ ...base, llm: llm({ classification: "question", confidence: 0.8 }) });
    ok("0.80 → draft", d2.action === "draft", d2.action);
  }
  console.log("safety rails");
  {
    ok("LLM down → review", decideAction({ ...base, llm: null }).action === "needs_review");
    ok("safety flag → review", decideAction({ ...base, llm: llm({ safety_flags: ["complaint_escalation"] }) }).action === "needs_review");
    ok("own address → ignore", decideAction({ ...base, llm: llm({}), isSelf: true }).action === "ignore");
    ok("master gate off → draft", decideAction({ ...base, llm: llm({ confidence: 0.95 }), autoReplyOn: false }).action === "draft");
    ok("daily cap → draft", decideAction({ ...base, llm: llm({ confidence: 0.95 }), sentToday: 25 }).action === "draft");
    ok("thread cap → draft", decideAction({ ...base, llm: llm({ confidence: 0.95 }), threadAutoSent7d: 5 }).action === "draft");
    ok("not_interested → no_reply", decideAction({ ...base, tier0: "not_interested", llm: null }).action === "no_reply");
    ok("ooo → ignore", decideAction({ ...base, tier0: "out_of_office", llm: null }).action === "ignore");
  }
  console.log("extract helpers");
  {
    ok("emails deduped+lowercased", JSON.stringify(extractEmails("A@x.com and a@X.com, b@y.org")) === JSON.stringify(["a@x.com", "b@y.org"]));
    ok("system addresses excluded", extractEmails("me@x.com noreply@x.com").every((e) => e === "me@x.com"));
    ok("isSystemAddress(own)", isSystemAddress("akshay.navale.work@gmail.com"));
    ok("phones", extractPhones("call 9821035181 or +91 90757 07650").length === 2);
    ok("threadRoot", threadRoot(["a", "b"], "c") === "a" && threadRoot([], "c") === "c");
    const s = splitAddr('"Rohan Sharma" <rohan.sharma@example.com>');
    ok("splitAddr", s.email === "rohan.sharma@example.com" && s.name === "Rohan Sharma");
  }

  // F: duplicate delivery → processed once (live DB, test rows cleaned up)
  console.log("F: idempotency (live DB)");
  {
    await ensureInboxSchema();
    const mid = `test-intel-${Date.now()}`;
    const src = "From: t@example.com\n\nhello test";
    const first = await syncInboundMessage({ messageId: mid, threadIds: [], leadId: 402, fromHeader: "T <t@example.com>", toHeader: "", ccHeader: "", subject: "test", source: src, date: null });
    const second = await syncInboundMessage({ messageId: mid, threadIds: [], leadId: 402, fromHeader: "T <t@example.com>", toHeader: "", ccHeader: "", subject: "test", source: src, date: null });
    const n = Number((await pool.query(`SELECT count(*)::int n FROM inbox_messages WHERE message_id = $1`, [mid])).rows[0].n);
    ok("sync twice → 1 row", first.synced && !second.synced && n === 1, `${first.synced}/${second.synced}/${n}`);
    await pool.query(`INSERT INTO inbox_contacts (message_id, email, confidence) VALUES ($1, 'x@example.com', 0.5) ON CONFLICT DO NOTHING`, [mid]);
    await pool.query(`INSERT INTO inbox_contacts (message_id, email, confidence) VALUES ($1, 'x@example.com', 0.5) ON CONFLICT DO NOTHING`, [mid]);
    const nc = Number((await pool.query(`SELECT count(*)::int n FROM inbox_contacts WHERE message_id = $1`, [mid])).rows[0].n);
    ok("contact twice → 1 row", nc === 1, String(nc));
    await pool.query(`DELETE FROM inbox_contacts WHERE message_id = $1`, [mid]);
    await pool.query(`DELETE FROM inbox_audit WHERE message_id = $1`, [mid]);
    await pool.query(`DELETE FROM inbox_messages WHERE message_id = $1`, [mid]);
    console.log("  (test rows cleaned up)");
    await pool.end();
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
