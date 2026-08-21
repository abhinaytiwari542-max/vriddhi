import { Sparkles } from "lucide-react";

import { prisma } from "@/backend/lib/db";
import { getDemoMerchant } from "@/backend/lib/demo-merchant";
import { detectAbandonedCheckoutOpportunity } from "@/backend/lib/services/opportunity-engine";
import { getOpportunityNarrative } from "@/backend/lib/services/opportunity-narrative";
import { evaluatePolicy } from "@/backend/lib/services/policy-engine";
import { detectCrossSellOpportunity } from "@/backend/lib/services/cross-sell-engine";
import { EmptyState } from "@/frontend/components/empty-state";
import { OpportunityCard } from "@/frontend/components/opportunities/opportunity-card";
import { CrossSellCard } from "@/frontend/components/opportunities/cross-sell-card";

// Opportunity detection must re-run on every request, not be cached as
// static HTML at build time.
export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const merchant = await getDemoMerchant();
  const result = merchant
    ? await detectAbandonedCheckoutOpportunity(merchant.id)
    : { detected: false as const };

  const narrative = result.detected ? await getOpportunityNarrative(result) : undefined;

  const policyCheck =
    result.detected && merchant
      ? await evaluatePolicy(merchant.id, {
          campaignCostPaise: result.estimatedCost,
          perTransactionPaise: result.estimatedCost / result.highIntentCount,
          discountPercent: (result.estimatedCost / result.highIntentValue) * 100,
        })
      : undefined;

  const existingCampaign = result.detected
    ? await prisma.campaign.findFirst({
        where: { opportunityId: result.opportunityId },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true },
      })
    : null;

  const crossSell = merchant ? await detectCrossSellOpportunity(merchant.id) : { detected: false as const };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Opportunities
        </h1>
        <p className="text-sm text-muted-foreground">
          Revenue signals detected in your order data, explained and
          recommended.
        </p>
      </div>

      {result.detected ? (
        <OpportunityCard
          result={result}
          narrative={narrative}
          policyCheck={policyCheck}
          existingCampaign={existingCampaign}
        />
      ) : (
        <EmptyState
          tone="ai"
          icon={Sparkles}
          title="No opportunities detected"
          description="No abandoned checkouts found in your order history right now — run the seed script (Phase 6) to generate demo data, or check back after your next sync."
        />
      )}

      {crossSell.detected && <CrossSellCard result={crossSell} />}
    </div>
  );
}
