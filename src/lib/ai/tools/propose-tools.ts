import { z } from "zod";

import { prisma } from "@/lib/db";
import type { CampaignStatus } from "@/generated/prisma/client";
import { defineTool } from "@/lib/ai/tools/types";

type RecommendedAction = {
  type: string;
  audienceCount: number;
  discountPerCustomer: number; // paise
  targetCustomerIds: string[];
};

type EvidenceRow = {
  orderId: string;
  customerId: string;
  amount: number; // paise
};

const NON_TERMINAL_CAMPAIGN_STATUSES: CampaignStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "EXECUTING",
];

/**
 * create_campaign never trusts model-supplied money figures — the only
 * input is which opportunity to act on. Discount amount, audience, and cost
 * are all re-read from the Opportunity row the deterministic engine wrote
 * in Phase 7. The result is always a DRAFT campaign; nothing here can reach
 * Razorpay or an Approval record.
 */
export const createCampaign = defineTool({
  name: "create_campaign",
  description:
    "Draft a recovery campaign from a detected opportunity. Creates a DRAFT campaign awaiting merchant approval — never executes anything.",
  effect: "propose",
  inputSchema: z.object({ opportunityId: z.string() }),
  handler: async (merchantId, input) => {
    const opportunity = await prisma.opportunity.findFirst({
      where: { id: input.opportunityId, merchantId },
    });
    if (!opportunity) {
      return { status: "error", message: "Opportunity not found for this merchant." };
    }

    const existing = await prisma.campaign.findFirst({
      where: {
        opportunityId: opportunity.id,
        status: { in: NON_TERMINAL_CAMPAIGN_STATUSES },
      },
    });
    if (existing) {
      return {
        status: "already_drafted",
        campaignId: existing.id,
        campaignStatus: existing.status,
        message: "A draft campaign for this opportunity already exists.",
      };
    }

    const action = opportunity.recommendedAction as unknown as RecommendedAction;
    const evidence = opportunity.evidence as unknown as EvidenceRow[];
    const evidenceByCustomer = new Map(evidence.map((e) => [e.customerId, e]));

    const campaign = await prisma.campaign.create({
      data: {
        opportunityId: opportunity.id,
        merchantId,
        status: "DRAFT",
        discountAmount: action.discountPerCustomer,
        audienceFilter: { source: "opportunity", opportunityId: opportunity.id },
        maxCost: opportunity.estimatedCost,
      },
    });

    await prisma.campaignTarget.createMany({
      data: action.targetCustomerIds.map((customerId) => {
        const row = evidenceByCustomer.get(customerId);
        const amount = Math.max((row?.amount ?? 0) - action.discountPerCustomer, 0);
        return {
          campaignId: campaign.id,
          customerId,
          orderId: row?.orderId,
          status: "PENDING" as const,
          idempotencyKey: `${campaign.id}:${customerId}`,
          amount,
        };
      }),
    });

    return {
      status: "drafted",
      campaignId: campaign.id,
      audienceCount: action.targetCustomerIds.length,
      maxCost: opportunity.estimatedCost,
      message: "Draft campaign created. It requires merchant approval before anything is sent — see Campaigns (Phase 11).",
    };
  },
});

/**
 * Always blocked in this phase, by design. Real payment-link creation
 * requires both a stored Approval record (Phase 11) and the Razorpay
 * integration (Phase 12) — neither exists yet, so this tool refuses
 * unconditionally rather than faking a result.
 */
export const createPaymentOrder = defineTool({
  name: "create_payment_order",
  description: "Create a Razorpay payment order for a customer. Not yet available — see the blocked response.",
  effect: "propose",
  inputSchema: z.object({ customerId: z.string(), amountRupees: z.number().min(1) }),
  handler: async () => {
    return {
      status: "blocked",
      reason:
        "Payment order creation requires a stored merchant approval (Phase 11) and the Razorpay integration (Phase 12), neither of which exists yet. No order was created.",
    };
  },
});
