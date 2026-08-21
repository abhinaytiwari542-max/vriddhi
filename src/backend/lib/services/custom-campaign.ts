import { z } from "zod";

import { prisma } from "@/backend/lib/db";
import { NON_TERMINAL_CAMPAIGN_STATUSES } from "@/backend/lib/ai/tools/propose-tools";
import { evaluatePolicy } from "@/backend/lib/services/policy-engine";

// ---------------------------------------------------------------------------
// Merchant-authored campaigns.
//
// A deliberate distinction, and worth being exact about it because it looks
// at first glance like a hole in this project's central guarantee:
//
//   The AI cannot supply financial numbers. That is enforced by
//   create_campaign's input schema having exactly one field —
//   `opportunityId` — and it stays true; this module is NOT a tool, is not
//   in TOOL_REGISTRY, and no model can reach it.
//
// What the merchant is allowed to do is different from what the model is
// allowed to do. The merchant is the authority the whole approval flow
// exists to serve, so letting them choose a discount and an audience is not
// a loosening of the guarantee — it is the thing the guarantee protects.
// The policy engine still bounds them, every selected customer is checked
// against the opportunity's own evidence, and the result is still only a
// DRAFT that has to be approved before anything executes.
// ---------------------------------------------------------------------------

/** ₹1,00,000 per customer. Not a policy limit — a sanity bound so a typo
 *  cannot reach the policy engine as a ten-crore proposal. */
const MAX_DISCOUNT_PAISE = 10_000_000;

export const CustomCampaignInput = z.object({
  opportunityId: z.string().min(1),
  /** Paise, so nothing downstream has to guess the unit. */
  discountPaise: z.number().int().positive().max(MAX_DISCOUNT_PAISE),
  customerIds: z.array(z.string().min(1)).min(1),
});

export type CustomCampaignInput = z.infer<typeof CustomCampaignInput>;

export type CustomCampaignResult =
  | { status: "drafted"; campaignId: string; audienceCount: number; maxCost: number }
  | { status: "blocked"; rule: string; requested: string; limit: string; message: string }
  | { status: "error"; message: string };

type EvidenceRow = {
  orderId: string;
  customerId: string;
  amount: number; // paise
};

/**
 * Drafts a campaign from an explicit merchant-chosen audience and discount.
 *
 * Everything the caller sends is treated as untrusted, including the
 * customer list: only ids that appear in this opportunity's own evidence are
 * accepted, so a tampered request cannot target arbitrary customers or reach
 * across merchants. The policy check runs here on the *chosen* numbers
 * rather than the engine's defaults — which is the point, since the whole
 * feature is letting those numbers differ.
 */
export async function draftCustomCampaign(
  merchantId: string,
  rawInput: unknown
): Promise<CustomCampaignResult> {
  const parsed = CustomCampaignInput.safeParse(rawInput);
  if (!parsed.success) {
    return { status: "error", message: "Invalid campaign settings." };
  }
  const input = parsed.data;

  const opportunity = await prisma.opportunity.findFirst({
    where: { id: input.opportunityId, merchantId },
  });
  if (!opportunity) {
    return { status: "error", message: "Opportunity not found for this merchant." };
  }

  const active = await prisma.campaign.findFirst({
    where: {
      opportunityId: opportunity.id,
      status: { in: NON_TERMINAL_CAMPAIGN_STATUSES },
    },
    select: { id: true, status: true },
  });
  if (active) {
    return {
      status: "error",
      message: `A campaign for this opportunity is already ${active.status.toLowerCase()}. Finish or reject it before drafting another.`,
    };
  }

  const evidence = opportunity.evidence as unknown as EvidenceRow[];
  const evidenceByCustomer = new Map(evidence.map((e) => [e.customerId, e]));

  // Reject the whole request rather than silently dropping unknown ids: a
  // caller asking to target someone who is not in this opportunity is
  // either tampering or out of date, and quietly creating a smaller
  // campaign than they asked for would hide both.
  const unknown = input.customerIds.filter((id) => !evidenceByCustomer.has(id));
  if (unknown.length > 0) {
    return {
      status: "error",
      message: `${unknown.length} selected customer(s) are no longer part of this opportunity. Reload and try again.`,
    };
  }

  const selected = [...new Set(input.customerIds)];
  const totalCost = input.discountPaise * selected.length;
  const selectedCartValue = selected.reduce(
    (sum, id) => sum + (evidenceByCustomer.get(id)?.amount ?? 0),
    0
  );
  const averageCartValue = selectedCartValue / Math.max(selected.length, 1);
  const discountPercent = (input.discountPaise / Math.max(averageCartValue, 1)) * 100;

  const policyCheck = await evaluatePolicy(merchantId, {
    campaignCostPaise: totalCost,
    perTransactionPaise: input.discountPaise,
    discountPercent,
  });

  if (policyCheck.verdict === "BLOCKED") {
    await prisma.auditLog.create({
      data: {
        merchantId,
        actor: "MERCHANT",
        action: "campaign.blocked",
        input: {
          opportunityId: opportunity.id,
          discountPaise: input.discountPaise,
          audienceCount: selected.length,
        },
        output: policyCheck,
        status: "BLOCKED",
        relatedEntityType: "Opportunity",
        relatedEntityId: opportunity.id,
        error: `${policyCheck.rule}: requested ${policyCheck.requested}, limit is ${policyCheck.limit}`,
      },
    });
    return {
      status: "blocked",
      rule: policyCheck.rule,
      requested: policyCheck.requested,
      limit: policyCheck.limit,
      message: `Blocked by policy: ${policyCheck.rule} — requested ${policyCheck.requested}, limit is ${policyCheck.limit}. No campaign was created.`,
    };
  }

  const campaign = await prisma.campaign.create({
    data: {
      opportunityId: opportunity.id,
      merchantId,
      status: "DRAFT",
      discountAmount: input.discountPaise,
      // Recorded so the audit trail shows this audience was hand-picked
      // rather than taken wholesale from the engine's recommendation.
      audienceFilter: {
        source: "merchant_selection",
        opportunityId: opportunity.id,
        selectedCount: selected.length,
        candidateCount: evidence.length,
      },
      maxCost: totalCost,
    },
  });

  await prisma.campaignTarget.createMany({
    data: selected.map((customerId) => {
      const row = evidenceByCustomer.get(customerId);
      return {
        campaignId: campaign.id,
        customerId,
        orderId: row?.orderId,
        status: "PENDING" as const,
        idempotencyKey: `${campaign.id}:${customerId}`,
        amount: Math.max((row?.amount ?? 0) - input.discountPaise, 0),
      };
    }),
  });

  await prisma.auditLog.create({
    data: {
      merchantId,
      actor: "MERCHANT",
      action: "campaign.drafted_custom",
      input: {
        opportunityId: opportunity.id,
        discountPaise: input.discountPaise,
        audienceCount: selected.length,
        candidateCount: evidence.length,
      },
      output: { campaignId: campaign.id, maxCost: totalCost },
      status: "SUCCESS",
      relatedEntityType: "Campaign",
      relatedEntityId: campaign.id,
    },
  });

  return {
    status: "drafted",
    campaignId: campaign.id,
    audienceCount: selected.length,
    maxCost: totalCost,
  };
}
