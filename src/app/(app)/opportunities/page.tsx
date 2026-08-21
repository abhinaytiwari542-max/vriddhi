import { Sparkles } from "lucide-react";

import { getDemoMerchant } from "@/lib/demo-merchant";
import { detectAbandonedCheckoutOpportunity } from "@/lib/services/opportunity-engine";
import { EmptyState } from "@/components/empty-state";
import { OpportunityCard } from "@/components/opportunities/opportunity-card";

export default async function OpportunitiesPage() {
  const merchant = await getDemoMerchant();
  const result = merchant
    ? await detectAbandonedCheckoutOpportunity(merchant.id)
    : { detected: false as const };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Opportunities
        </h1>
        <p className="text-sm text-muted-foreground">
          Revenue signals detected in your order data, with evidence and a
          recommended action.
        </p>
      </div>

      {result.detected ? (
        <OpportunityCard result={result} />
      ) : (
        <EmptyState
          tone="ai"
          icon={Sparkles}
          title="No opportunities detected"
          description="No abandoned checkouts found in your order history right now — run the seed script (Phase 6) to generate demo data, or check back after your next sync."
        />
      )}
    </div>
  );
}
