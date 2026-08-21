import { Sparkles } from "lucide-react";

import { prisma } from "@/backend/lib/db";
import { getDemoMerchant } from "@/backend/lib/demo-merchant";
import { detectAbandonedCheckoutOpportunity } from "@/backend/lib/services/opportunity-engine";
import { getOpportunityNarrative } from "@/backend/lib/services/opportunity-narrative";
import { evaluatePolicy } from "@/backend/lib/services/policy-engine";
import { detectCrossSellOpportunity } from "@/backend/lib/services/cross-sell-engine";
import { NON_TERMINAL_CAMPAIGN_STATUSES } from "@/backend/lib/ai/tools/propose-tools";
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

  // Only a campaign that is still live blocks drafting another. Querying
  // without the status filter meant a finished campaign hid the draft
  // button permanently, so a second recovery run on the same opportunity
  // was impossible from the UI even though create_campaign permits it.
  const activeCampaign = result.detected
    ? await prisma.campaign.findFirst({
        where: {
          opportunityId: result.opportunityId,
          status: { in: NON_TERMINAL_CAMPAIGN_STATUSES },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true },
      })
    : null;

  // Shown for context when there is no active campaign: what the last run
  // did, so drafting again is an informed choice rather than a blind repeat.
  const lastFinishedCampaign =
    result.detected && !activeCampaign
      ? await prisma.campaign.findFirst({
          where: {
            opportunityId: result.opportunityId,
            status: { notIn: NON_TERMINAL_CAMPAIGN_STATUSES },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            createdAt: true,
            _count: { select: { targets: true } },
            targets: { where: { status: "PAID" }, select: { id: true } },
          },
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
          existingCampaign={activeCampaign}
          lastFinishedCampaign={
            lastFinishedCampaign
              ? {
                  id: lastFinishedCampaign.id,
                  status: lastFinishedCampaign.status,
                  createdAt: lastFinishedCampaign.createdAt,
                  targetCount: lastFinishedCampaign._count.targets,
                  paidCount: lastFinishedCampaign.targets.length,
                }
              : null
          }
        />
      ) : (
        <EmptyState
          tone="ai"
          icon={Sparkles}
          title="No opportunities detected"
          description="Nothing recoverable in your current order history. New abandoned checkouts appear here automatically as they age past 30 minutes."
        />
      )}

      {crossSell.detected && <CrossSellCard result={crossSell} />}
    </div>
  );
}
