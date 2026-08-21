import { Prisma } from "@/generated/prisma/client";

import { prisma } from "@/backend/lib/db";
import {
  buildPrompt,
  explainOpportunity,
  type NarrativeResult,
} from "@/backend/lib/ai/explain-opportunity";
import { verifyGrounding } from "@/backend/lib/ai/grounding";
import { OpportunityNarrativeSchema } from "@/backend/lib/ai/schemas";
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
    // Re-verify on every READ, not just at generation time. The cache is a
    // schema-free Json column that outlives the call that filled it, so a
    // narrative written before the grounding check existed — or written by
    // any path that bypassed it, or edited in the database directly — would
    // otherwise be re-served to the merchant forever without ever being
    // checked again. Verification is pure string work against numbers we
    // already have, so doing it per read costs nothing worth saving.
    const cachedNarrative = OpportunityNarrativeSchema.safeParse(opportunity.aiNarrative);
    if (cachedNarrative.success) {
      const grounding = verifyGrounding(
        { ...cachedNarrative.data },
        buildPrompt(result).facts
      );
      if (grounding.ok) {
        return { ok: true, narrative: cachedNarrative.data, grounding, cached: true };
      }
      console.error(
        "[getOpportunityNarrative] cached narrative failed grounding — discarding:",
        grounding.findings.map((f) => `${f.field}: ${f.reason}`).join("; ")
      );
      // Drop the poisoned cache entry so the next request regenerates
      // instead of re-reading it.
      await prisma.opportunity.update({
        where: { id: result.opportunityId },
        data: { aiNarrative: Prisma.DbNull, aiNarrativeInputHash: null },
      });
      await prisma.auditLog.create({
        data: {
          merchantId: opportunity.merchantId,
          actor: "SYSTEM",
          action: "opportunity.narrative_blocked",
          input: { opportunityId: result.opportunityId, source: "cache" },
          output: { findings: grounding.findings },
          status: "BLOCKED",
          relatedEntityType: "Opportunity",
          relatedEntityId: result.opportunityId,
          error: "Cached narrative contained figures the rules engine never produced.",
        },
      });
      return { ok: false, reason: "ungrounded", grounding };
    }
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
    } else if (generated.reason === "ungrounded") {
      await prisma.auditLog.create({
        data: {
          merchantId: opportunity.merchantId,
          actor: "SYSTEM",
          action: "opportunity.narrative_blocked",
          input: { opportunityId: result.opportunityId, source: "generation" },
          output: { findings: generated.grounding?.findings ?? [] },
          status: "BLOCKED",
          relatedEntityType: "Opportunity",
          relatedEntityId: result.opportunityId,
          error: "Generated narrative contained figures the rules engine never produced.",
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
