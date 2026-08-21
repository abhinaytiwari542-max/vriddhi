import { prisma } from "@/backend/lib/db";
import { explainOpportunity, type NarrativeResult } from "@/backend/lib/ai/explain-opportunity";
import type { OpportunityNarrative } from "@/backend/lib/ai/schemas";
import type { AbandonedCheckoutResult } from "@/backend/lib/services/opportunity-engine";

type DetectedResult = Extract<AbandonedCheckoutResult, { detected: true }>;

function hashInputs(result: DetectedResult) {
  return [
    result.totalAbandonedCount,
    result.highIntentCount,
    result.totalAbandonedValue,
    result.estimatedCost,
    result.impactMin,
    result.impactMax,
  ].join(":");
}

/**
 * Wraps explainOpportunity() with a cache on the Opportunity row, keyed to a
 * hash of the exact numbers the narrative was written about. Re-detection
 * that produces the same numbers reuses the cached narrative instead of
 * paying for another Claude call; numbers changing invalidates it.
 */
export async function getOpportunityNarrative(
  result: DetectedResult
): Promise<NarrativeResult & { cached?: boolean }> {
  const inputHash = hashInputs(result);
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: result.opportunityId },
  });

  if (opportunity?.aiNarrative && opportunity.aiNarrativeInputHash === inputHash) {
    return {
      ok: true,
      narrative: opportunity.aiNarrative as OpportunityNarrative,
      cached: true,
    };
  }

  const generated = await explainOpportunity(result);

  // opportunity is only null if the row was deleted between the lookup
  // above and here — too narrow a race to be worth handling beyond not
  // crashing; audit logging (which needs a real merchantId) is skipped.
  if (opportunity) {
    if (generated.ok) {
      await prisma.opportunity.update({
        where: { id: result.opportunityId },
        data: { aiNarrative: generated.narrative, aiNarrativeInputHash: inputHash },
      });
      await prisma.auditLog.create({
        data: {
          merchantId: opportunity.merchantId,
          actor: "AI",
          action: "opportunity.narrative_generated",
          input: { opportunityId: result.opportunityId },
          output: generated.narrative,
          status: "SUCCESS",
          relatedEntityType: "Opportunity",
          relatedEntityId: result.opportunityId,
        },
      });
    } else if (generated.reason !== "no_api_key") {
      // Not logging the no_api_key case — that's a standing configuration
      // state, not an event, and would otherwise fire on every page view.
      await prisma.auditLog.create({
        data: {
          merchantId: opportunity.merchantId,
          actor: "AI",
          action: "opportunity.narrative_failed",
          input: { opportunityId: result.opportunityId },
          output: {},
          status: "FAILURE",
          relatedEntityType: "Opportunity",
          relatedEntityId: result.opportunityId,
          error: generated.reason,
        },
      });
    }
  }

  return generated;
}
