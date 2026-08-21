import { prisma } from "@/lib/db";

export type CrossSellDecisionResult = { ok: true } | { ok: false; error: string };

/**
 * No policy engine involvement here, on purpose — evaluatePolicy() guards
 * financial exposure (campaign budgets, discounts, transaction limits), and
 * a cross-sell recommendation moves no money and charges no one. The only
 * guardrail this action needs is the human approval itself.
 *
 * "Execution" for this opportunity type means writing a ProductCrossSell
 * row — a catalog/merchandising change — not a Razorpay call.
 */
export async function approveCrossSell(
  opportunityId: string,
  actorUserId: string
): Promise<CrossSellDecisionResult> {
  const opportunity = await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
  if (opportunity.status !== "OPEN" || opportunity.type !== "CROSS_SELL") {
    return { ok: false, error: "This recommendation is no longer awaiting a decision." };
  }

  const action = opportunity.recommendedAction as { productId: string; recommendedProductId: string };

  const existing = await prisma.productCrossSell.findUnique({
    where: {
      productId_recommendedProductId: {
        productId: action.productId,
        recommendedProductId: action.recommendedProductId,
      },
    },
  });

  await prisma.$transaction([
    ...(existing
      ? []
      : [
          prisma.productCrossSell.create({
            data: {
              merchantId: opportunity.merchantId,
              productId: action.productId,
              recommendedProductId: action.recommendedProductId,
              opportunityId,
              support: (opportunity.evidence as [{ coOccurrenceCount: number }])[0].coOccurrenceCount,
              confidence: (opportunity.evidence as [{ confidence: number }])[0].confidence,
              lift: (opportunity.evidence as [{ lift: number }])[0].lift,
            },
          }),
        ]),
    prisma.opportunity.update({ where: { id: opportunityId }, data: { status: "ACTIONED" } }),
    prisma.auditLog.create({
      data: {
        merchantId: opportunity.merchantId,
        actor: "MERCHANT",
        action: "cross_sell.approved",
        input: { opportunityId, actorUserId },
        output: action,
        status: "SUCCESS",
        relatedEntityType: "Opportunity",
        relatedEntityId: opportunityId,
      },
    }),
  ]);

  return { ok: true };
}

export async function rejectCrossSell(
  opportunityId: string,
  actorUserId: string
): Promise<CrossSellDecisionResult> {
  const opportunity = await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
  if (opportunity.status !== "OPEN" || opportunity.type !== "CROSS_SELL") {
    return { ok: false, error: "This recommendation is no longer awaiting a decision." };
  }

  await prisma.$transaction([
    prisma.opportunity.update({ where: { id: opportunityId }, data: { status: "DISMISSED" } }),
    prisma.auditLog.create({
      data: {
        merchantId: opportunity.merchantId,
        actor: "MERCHANT",
        action: "cross_sell.rejected",
        input: { opportunityId, actorUserId },
        output: opportunity.recommendedAction as object,
        status: "SUCCESS",
        relatedEntityType: "Opportunity",
        relatedEntityId: opportunityId,
      },
    }),
  ]);

  return { ok: true };
}
