import { beforeEach } from "vitest";

import { prisma } from "@/backend/lib/db";

// Truncate every app table before each test — tests build their own
// fixtures from scratch, so the test DB is always empty going in. RESTART
// IDENTITY isn't needed (all PKs are cuid strings), CASCADE handles FKs.
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "failures", "approvals", "campaign_targets", "campaigns",
      "product_cross_sells", "opportunities", "agent_actions",
      "audit_logs", "payments", "order_items", "orders",
      "customers", "products", "policies", "users", "merchants"
    CASCADE
  `);
});
