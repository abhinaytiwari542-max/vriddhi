import { describe, expect, it } from "vitest";

import { runTool } from "@/backend/lib/ai/tool-runner";
import { prisma } from "@/backend/lib/db";
import { createAbandonedOrder, createCustomer, createMerchant, createOpportunity } from "./helpers/fixtures";

// ---------------------------------------------------------------------------
// Phase 25 — adversarial coverage of the tool layer specifically. Unlike
// tests/tool-safety.test.ts (which proves the schema-level guardrail once),
// this file is a deliberate attack catalogue: cross-tenant access, injection
// payloads, prototype pollution, and boundary-value abuse. Every attack here
// goes through the exact same runTool() chokepoint a live LLM call would use
// — no attack is special-cased in application code, and none of these
// should ever require a code change to keep failing.
// ---------------------------------------------------------------------------

describe("red team — cross-tenant access (IDOR)", () => {
  it("refuses to draft a campaign against another merchant's opportunity", async () => {
    const { merchant: victim } = await createMerchant();
    const victimCustomer = await createCustomer(victim.id);
    const victimOrder = await createAbandonedOrder(victim.id, victimCustomer.id, { amount: 5_000_00 });
    const victimOpportunity = await createOpportunity(victim.id, {
      evidence: [{ orderId: victimOrder.id, customerId: victimCustomer.id, amount: 5_000_00 }],
      recommendedAction: {
        type: "recovery_discount_campaign",
        audienceCount: 1,
        discountPerCustomer: 100_00,
        targetCustomerIds: [victimCustomer.id],
      },
      estimatedCost: 100_00,
    });

    // A second, unrelated merchant — the "attacker" — guesses or is given
    // the victim's opportunity id and tries to act on it as if it were
    // their own.
    const { merchant: attacker } = await createMerchant();

    const result = await runTool(attacker.id, "CHAT", "create_campaign", {
      opportunityId: victimOpportunity.id,
    });

    expect(result.ok).toBe(true); // runTool itself succeeds; the tool's own output says no
    if (!result.ok) return;
    expect((result.output as { status: string }).status).toBe("error");
    expect(await prisma.campaign.count()).toBe(0);
  });

  it("read tools ignore an attempted merchantId override in the input and stay scoped to the caller", async () => {
    const { merchant: victim } = await createMerchant();
    await createCustomer(victim.id, { name: "Victim's Customer" });

    const { merchant: attacker } = await createMerchant();
    await createCustomer(attacker.id, { name: "Attacker's Own Customer" });

    // No tool's schema has a merchantId field (merchantId is always the
    // caller identity runTool() was invoked with, never model input) — this
    // confirms smuggling one in has zero effect, not just that the schema
    // happens to lack the field.
    const result = await runTool(attacker.id, "CHAT", "get_customers", {
      merchantId: victim.id,
      repeatOnly: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const names = (result.output as Array<{ name: string }>).map((c) => c.name);
    expect(names).toContain("Attacker's Own Customer");
    expect(names).not.toContain("Victim's Customer");
  });
});

describe("red team — boundary and injection payloads against create_campaign", () => {
  async function seedOpportunity(merchantId: string, overrides: Parameters<typeof createOpportunity>[1] = {}) {
    const customer = await createCustomer(merchantId);
    const order = await createAbandonedOrder(merchantId, customer.id, { amount: 3_000_00 });
    return createOpportunity(merchantId, {
      evidence: [{ orderId: order.id, customerId: customer.id, amount: 3_000_00 }],
      recommendedAction: {
        type: "recovery_discount_campaign",
        audienceCount: 1,
        discountPerCustomer: 100_00,
        targetCustomerIds: [customer.id],
      },
      estimatedCost: 100_00,
      ...overrides,
    });
  }

  it("ignores a smuggled negative discount, using the real positive number instead", async () => {
    const { merchant } = await createMerchant({ maxCampaignBudget: 500_000 });
    const opportunity = await seedOpportunity(merchant.id);

    const result = await runTool(merchant.id, "CHAT", "create_campaign", {
      opportunityId: opportunity.id,
      discountPerCustomer: -999_999_00, // attacker hopes for a negative-cost exploit
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const campaignId = (result.output as { campaignId: string }).campaignId;
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(campaign.discountAmount).toBeGreaterThan(0);
    expect(campaign.discountAmount).toBe(100_00);
  });

  it("does not crash and creates nothing on a SQL/NoSQL-injection-shaped opportunityId", async () => {
    const { merchant } = await createMerchant();
    const payloads = [
      "'; DROP TABLE opportunities; --",
      "' OR '1'='1",
      JSON.stringify({ $ne: null }),
      "../../../etc/passwd",
    ];

    for (const payload of payloads) {
      const result = await runTool(merchant.id, "CHAT", "create_campaign", { opportunityId: payload });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect((result.output as { status: string }).status).toBe("error");
    }

    expect(await prisma.campaign.count()).toBe(0);
    expect(await prisma.opportunity.count({ where: { merchantId: merchant.id } })).toBe(0);
  });

  it("prototype-pollution-shaped keys have no effect on the created campaign or the global prototype", async () => {
    const { merchant } = await createMerchant({ maxCampaignBudget: 500_000 });
    const opportunity = await seedOpportunity(merchant.id);

    // Built via JSON.parse deliberately — that's what actually gives
    // "__proto__" real own-property status (an object literal's __proto__
    // key sets the prototype at creation time instead), and it's the
    // realistic shape of this input: Gemini's function-call arguments
    // arrive as parsed JSON, same as this.
    const maliciousArgs = JSON.parse(
      JSON.stringify({
        opportunityId: opportunity.id,
        __proto__: { isAdmin: true, autoExecuteEnabled: true },
        constructor: { prototype: { discountAmount: 999_999_00 } },
      })
    );

    const result = await runTool(merchant.id, "CHAT", "create_campaign", maliciousArgs);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const campaignId = (result.output as { campaignId: string }).campaignId;
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(campaign.discountAmount).toBe(100_00);
    // The global Object prototype itself is unaffected — a real pollution
    // vulnerability would leak here too, on a brand-new unrelated object.
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
  });
});

describe("red team — create_payment_order refuses regardless of payload shape", () => {
  it("stays blocked across a range of adversarial amounts and identifiers", async () => {
    const { merchant } = await createMerchant();
    const payloads = [
      { customerId: "any-customer", amountRupees: 1 },
      { customerId: "any-customer", amountRupees: 1_00_00_000 }, // ₹1 crore
      { customerId: "'; DROP TABLE payments; --", amountRupees: 500 },
    ];

    for (const payload of payloads) {
      const result = await runTool(merchant.id, "CHAT", "create_payment_order", payload);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect((result.output as { status: string }).status).toBe("blocked");
    }

    expect(await prisma.payment.count()).toBe(0);
  });

  it("rejects zero/negative amounts at the schema layer before the handler ever runs", async () => {
    const { merchant } = await createMerchant();
    const result = await runTool(merchant.id, "CHAT", "create_payment_order", {
      customerId: "any-customer",
      amountRupees: -50,
    });
    expect(result.ok).toBe(false);

    const logged = await prisma.agentAction.findFirst({
      where: { merchantId: merchant.id, toolName: "create_payment_order" },
      orderBy: { createdAt: "desc" },
    });
    expect(logged?.status).toBe("error");
  });
});
