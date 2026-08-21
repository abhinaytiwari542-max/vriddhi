import { Megaphone } from "lucide-react";

import { getDemoMerchant } from "@/lib/demo-merchant";
import { prisma } from "@/lib/db";
import { formatInr } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { ApprovalCard } from "@/components/campaigns/approval-card";
import { ExecutionCard } from "@/components/campaigns/execution-card";

export const dynamic = "force-dynamic";

const HISTORY_BADGE = {
  REJECTED: "danger",
  EXECUTING: "info",
  COMPLETED: "success",
  HALTED: "pending",
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
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const drafts = campaigns.filter((c) => c.status === "DRAFT");
  const approved = campaigns.filter((c) => c.status === "APPROVED");
  const history = campaigns.filter((c) => !["DRAFT", "APPROVED"].includes(c.status));

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Campaigns</h1>
        <p className="text-sm text-muted-foreground">
          Drafted, approved, executed, and rejected recovery actions.
        </p>
      </div>

      {drafts.length === 0 && approved.length === 0 && history.length === 0 && (
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

      {approved.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-medium text-foreground">Approved — ready to execute</h2>
          {approved.map((c) => (
            <ExecutionCard
              key={c.id}
              campaignId={c.id}
              audienceCount={c.targets.length}
              discountAmount={c.discountAmount}
              maxCost={c.maxCost}
              isSimulated={isSimulated}
            />
          ))}
        </section>
      )}

      {history.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-foreground">History</h2>
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
                      <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
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
                                <td className="px-3 py-2 text-muted-foreground">{t.status}</td>
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
