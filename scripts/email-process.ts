import { processEmailQueue } from "../src/lib/email/process";
async function main() {
  const result = await processEmailQueue();
  console.log(`Email queue: ${result.sent} sent, ${result.failed} failed`);
  process.exit(0);
}
main().catch((e) => { console.error("Email processing failed:", e); process.exit(1); });
