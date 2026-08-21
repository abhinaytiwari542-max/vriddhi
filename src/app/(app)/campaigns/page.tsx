import { CheckCircle2, IndianRupee, Link2, Megaphone } from "lucide-react";

import { getDemoMerchant } from "@/backend/lib/demo-merchant";
import { prisma } from "@/backend/lib/db";
import { formatInr } from "@/frontend/lib/format";
import { EmptyState } from "@/frontend/components/empty-state";
import { StatusBadge } from "@/frontend/components/status-badge";
import { ApprovalCard } from "@/frontend/components/campaigns/approval-card";
import { ExecutionCard } from "@/frontend/components/campaigns/execution-card";
import { SimulatePaymentButton } from "@/frontend/components/campaigns/simulate-payment-button";
import { MetricTile } from "@/frontend/components/dashboard/metric-tile";

export const dynamic = "force-dynamic";

const HISTORY_BADGE = {
  REJECTED: "danger",
  COMPLETED: "success",
  FAILED: "danger",
} as const;

export default async function CampaignsPage() {
  const isSimulated = !process.env.RAZORPAY_KEY_ID;
  const merchant = await getDemoMerchant();
  const campaigns = merchant
    ? await prisma.campaign.findMany({
        where: { merchantId: merchant.id },
        include: {
          opportunity: true,
          targets: { include: { customer: true } },
          approvals: { include: { actorUser: true }, orderBy: { createdAt: "desc" } },
          failures: { orderBy: { detectedAt: "desc" }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const drafts = campaigns.filter((c) => c.status === "DRAFT");
  const actionable = campaigns.filter(
    (c) => c.status === "APPROVED" || c.status === "HALTED" || c.status === "EXECUTING"
  );
  const history = campaigns.filter(
    (c) => !["DRAFT", "APPROVED", "HALTED", "EXECUTING"].includes(c.status)
  );

  const allTargets = campaigns.flatMap((c) => c.targets);
  const linksCreated = allTargets.filter(
    (t) => t.status === "LINK_CREATED" || t.status === "PAID"
  ).length;
  const paid = allTargets.filter((t) => t.status === "PAID");
  const collected = paid.reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Every recovery action, from proposal through to the money landing.
          </p>
        </div>
        <StatusBadge variant={isSimulated ? "pending" : "success"}>
          {isSimulated ? "Simulated gateway" : "Razorpay test mode"}
        </StatusBadge>
      </div>

      {campaigns.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricTile
            label="Campaigns"
            value={String(campaigns.length)}
            icon={Megaphone}
            hint="Drafted, run, or rejected"
          />
          <MetricTile
            label="Links created"
            value={String(linksCreated)}
            icon={Link2}
            hint="One Razorpay link per customer"
          />
          <MetricTile
            label="Customers paid"
            value={String(paid.length)}
            icon={CheckCircle2}
            hint="Confirmed by signed webhook"
          />
          <MetricTile
            label="Recovered"
            value={formatInr(collected)}
            icon={IndianRupee}
            hint="Cash back from stalled carts"
          />
        </div>
      )}

      {drafts.length === 0 && actionable.length === 0 && history.length === 0 && (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          description="Draft one from an opportunity on the Opportunities page — it will show up here awaiting your approval."
        />
      )}

      {drafts.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Awaiting your approval</h2>
            <p className="text-xs text-muted-foreground">Nothing sends until you approve</p>
          </div>
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

      {actionable.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Ready to execute</h2>
            <p className="text-xs text-muted-foreground">Approved, waiting to send links</p>
          </div>
          {actionable.map((c) => {
            const createdCount = c.targets.filter(
              (t) => t.status === "LINK_CREATED" || t.status === "PAID"
            ).length;
            const remainingCount = c.targets.length - createdCount;
            return (
              <ExecutionCard
                key={c.id}
                campaignId={c.id}
                audienceCount={c.targets.length}
                discountAmount={c.discountAmount}
                maxCost={c.maxCost}
                isSimulated={isSimulated}
                status={c.status as "APPROVED" | "HALTED" | "EXECUTING"}
                createdCount={createdCount}
                remainingCount={remainingCount}
                haltReason={c.failures[0]?.reason}
              />
            );
          })}
        </section>
      )}

      {history.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">History</h2>
            <p className="text-xs text-muted-foreground">Finished and rejected campaigns</p>
          </div>
          <div className="space-y-3">
            {history.map((c) => {
              const latestApproval = c.approvals[0];
              const executedTargets = c.targets.filter((t) => t.razorpayPaymentLinkId);
              return (
                <div key={c.id} className="rounded-2xl border border-border">
                  <div className="flex items-center justify-between gap-4 p-4 text-sm">
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

                  {executedTargets.length > 0 && (
                    <div className="border-t border-border p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          Payment links ({executedTargets.length})
                        </p>
                        <StatusBadge variant={isSimulated ? "pending" : "success"}>
                          {isSimulated ? "SIMULATED gateway" : "Razorpay test mode"}
                        </StatusBadge>
                      </div>
                      <div className="max-h-48 overflow-x-auto overflow-y-auto rounded-lg border border-border">
                        <table className="w-full text-left text-xs">
                          <thead className="sticky top-0 bg-card text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2 font-medium">Customer</th>
                              <th className="px-3 py-2 font-medium">Amount</th>
                              <th className="px-3 py-2 font-medium">Status</th>
                              <th className="px-3 py-2 font-medium">Payment link ID</th>
                            </tr>
                          </thead>
                          <tbody>
                            {executedTargets.map((t) => (
                              <tr key={t.id} className="border-t border-border">
                                <td className="px-3 py-2 text-foreground">{t.customer.name}</td>
                                <td className="px-3 py-2 text-foreground">{formatInr(t.amount)}</td>
                                <td className="px-3 py-2 text-muted-foreground">
                                  {t.status === "LINK_CREATED" ? (
                                    <SimulatePaymentButton campaignTargetId={t.id} />
                                  ) : (
                                    t.status
                                  )}
                                </td>
                                <td className="px-3 py-2 font-mono text-muted-foreground">
                                  {t.razorpayPaymentLinkId}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
