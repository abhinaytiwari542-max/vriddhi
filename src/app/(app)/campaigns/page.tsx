import { Megaphone } from "lucide-react";

import { getDemoMerchant } from "@/lib/demo-merchant";
import { prisma } from "@/lib/db";
import { formatInr } from "@/lib/services/opportunity-engine";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { ApprovalCard } from "@/components/campaigns/approval-card";

export const dynamic = "force-dynamic";

const HISTORY_BADGE = {
  APPROVED: "success",
  REJECTED: "danger",
  DRAFT: "info",
} as const;

export default async function CampaignsPage() {
  const merchant = await getDemoMerchant();
  const campaigns = merchant
    ? await prisma.campaign.findMany({
        where: { merchantId: merchant.id },
        include: {
          opportunity: true,
          targets: true,
          approvals: { include: { actorUser: true }, orderBy: { createdAt: "desc" } },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const drafts = campaigns.filter((c) => c.status === "DRAFT");
  const decided = campaigns.filter((c) => c.status !== "DRAFT");

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Campaigns</h1>
        <p className="text-sm text-muted-foreground">
          Drafted, approved, and rejected recovery actions.
        </p>
      </div>

      {drafts.length === 0 && decided.length === 0 && (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          description="Draft one from an opportunity on the Opportunities page — it will show up here awaiting your approval."
        />
      )}

      {drafts.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-medium text-foreground">Awaiting your approval</h2>
          {drafts.map((c) => (
            <ApprovalCard
              key={c.id}
              campaignId={c.id}
              audienceCount={c.targets.length}
              discountAmount={c.discountAmount}
              maxCost={c.maxCost}
              impactMin={c.opportunity.impactMin}
              impactMax={c.opportunity.impactMax}
              risk={c.opportunity.risk}
            />
          ))}
        </section>
      )}

      {decided.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-foreground">History</h2>
          <div className="divide-y divide-border rounded-2xl border border-border">
            {decided.map((c) => {
              const latestApproval = c.approvals[0];
              return (
                <div key={c.id} className="flex items-center justify-between gap-4 p-4 text-sm">
                  <div>
                    <p className="font-medium text-foreground">
                      {c.targets.length} customers · {formatInr(c.discountAmount)} discount ·{" "}
                      {formatInr(c.maxCost)} max cost
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {latestApproval
                        ? `${latestApproval.decision} by ${latestApproval.actorUser.email} · ${latestApproval.createdAt.toLocaleString()}`
                        : c.createdAt.toLocaleString()}
                    </p>
                  </div>
                  <StatusBadge variant={HISTORY_BADGE[c.status as keyof typeof HISTORY_BADGE] ?? "info"}>
                    {c.status}
                  </StatusBadge>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
