import Link from "next/link";
import { Sparkles } from "lucide-react";

import { prisma } from "@/backend/lib/db";
import { getDemoMerchant } from "@/backend/lib/demo-merchant";
import { NON_TERMINAL_CAMPAIGN_STATUSES } from "@/backend/lib/ai/tools/propose-tools";
import {
  RECOVERY_DISCOUNT_PAISE,
  detectAbandonedCheckoutOpportunity,
} from "@/backend/lib/services/opportunity-engine";
import { getOrCreatePolicy } from "@/backend/lib/services/policy-engine";
import { formatInr } from "@/frontend/lib/format";
import { EmptyState } from "@/frontend/components/empty-state";
import { StatusBadge } from "@/frontend/components/status-badge";
import { CampaignBuilder } from "@/frontend/components/campaigns/campaign-builder";

export const dynamic = "force-dynamic";

export default async function CampaignBuilderPage() {
  const merchant = await getDemoMerchant();
  const result = merchant
    ? await detectAbandonedCheckoutOpportunity(merchant.id)
    : { detected: false as const };

  if (!merchant || !result.detected) {
    return (
      <div className="space-y-8">
        <Header />
        <EmptyState
          tone="ai"
          icon={Sparkles}
          title="Nothing to build a campaign from"
          description="No abandoned-checkout opportunity is open right now. New abandoned checkouts appear automatically once they age past 30 minutes."
        />
      </div>
    );
  }

  const [policy, activeCampaign] = await Promise.all([
    getOrCreatePolicy(merchant.id),
    prisma.campaign.findFirst({
      where: {
        opportunityId: result.opportunityId,
        status: { in: NON_TERMINAL_CAMPAIGN_STATUSES },
      },
      select: { id: true, status: true },
    }),
  ]);

  // Same rule the engine enforces, surfaced before the merchant spends time
  // picking an audience they would not be allowed to submit.
  if (activeCampaign) {
    return (
      <div className="space-y-8">
        <Header />
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-2 flex items-center gap-2">
            <StatusBadge variant="info">
              Campaign {activeCampaign.status.toLowerCase()}
            </StatusBadge>
          </div>
          <h3 className="mb-1 text-lg font-semibold text-foreground">
            A campaign for this opportunity is already in flight
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Only one live campaign can target an opportunity at a time, so nothing can be
            double-charged. Approve, execute, or reject that one and this page will open up
            again.
          </p>
          <Link
            href="/campaigns"
            className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go to Campaigns →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <Header />

      <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-muted/50 p-4 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{result.highIntentCount}</span> high-intent
          customers detected
        </span>
        <span>·</span>
        <span>
          <span className="font-medium text-foreground">
            {formatInr(result.highIntentValue)}
          </span>{" "}
          combined cart value
        </span>
        <span>·</span>
        <span>
          Limits: {formatInr(policy.maxCampaignBudget)} budget ·{" "}
          {formatInr(policy.maxTransactionValue)} per customer · {policy.maxDiscountPercent}% max
          discount
        </span>
      </div>

      <CampaignBuilder
        opportunityId={result.opportunityId}
        defaultDiscountPaise={RECOVERY_DISCOUNT_PAISE}
        policy={{
          maxCampaignBudget: policy.maxCampaignBudget,
          maxDiscountPercent: policy.maxDiscountPercent,
          maxTransactionValue: policy.maxTransactionValue,
        }}
        candidates={result.evidence.map((e) => ({
          customerId: e.customerId,
          orderId: e.orderId,
          customerName: e.customerName,
          amount: e.amount,
          hoursSinceAbandoned: e.hoursSinceAbandoned,
          isRepeatCustomer: e.isRepeatCustomer,
          intentScore: e.intentScore,
        }))}
      />
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-foreground">Campaign builder</h1>
      <p className="text-sm text-muted-foreground">
        Choose exactly who gets a discount and how much, and see the cost, expected recovery and
        policy verdict before you commit to anything.
      </p>
    </div>
  );
}
