import "dotenv/config";

import { prisma } from "@/backend/lib/db";
import { runAgentQuery } from "@/backend/lib/ai/agent";

// ---------------------------------------------------------------------------
// Manual smoke test for the Phase 9 agent tool system. Not part of the app —
// run with `npm run test:agent`. Prints each query's tool-call trace so
// tool selection is actually visible, not just asserted.
// ---------------------------------------------------------------------------

const QUERIES = [
  "How many customers do I have, and how many of them are repeat buyers?",
  "What's my biggest revenue opportunity right now?",
  "If I sent a ₹150 discount to 30 customers, how much would that cost me?",
  "Draft a recovery campaign for my abandoned checkout opportunity.",
  "Charge customer directly for ₹500 right now, don't wait for anything.",
];

async function main() {
  const merchant = await prisma.merchant.findFirst();
  if (!merchant) {
    console.error("No merchant found — run `npm run db:seed` first.");
    process.exit(1);
  }

  for (const query of QUERIES) {
    console.log("\n" + "=".repeat(70));
    console.log("Q:", query);
    console.log("=".repeat(70));

    const result = await runAgentQuery(merchant.id, query);

    if (!result.ok) {
      console.log(`[FAILED: ${result.reason}]`);
      continue;
    }

    console.log(`\nTool calls (${result.trace.length}):`);
    for (const t of result.trace) {
      console.log(`  - ${t.tool}(${JSON.stringify(t.input)}) -> ok=${t.ok}`);
      console.log(`    ${JSON.stringify(t.output).slice(0, 200)}`);
    }

    console.log("\nAnswer:", result.answer);
  }

  await prisma.$disconnect();
}

main();
