import { prisma } from "@/lib/db";
import { explainOpportunity, type NarrativeResult } from "@/lib/ai/explain-opportunity";
import type { OpportunityNarrative } from "@/lib/ai/schemas";
import type { AbandonedCheckoutResult } from "@/lib/services/opportunity-engine";

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
  if (generated.ok) {
    await prisma.opportunity.update({
      where: { id: result.opportunityId },
      data: { aiNarrative: generated.narrative, aiNarrativeInputHash: inputHash },
    });
  }
  return generated;
}
