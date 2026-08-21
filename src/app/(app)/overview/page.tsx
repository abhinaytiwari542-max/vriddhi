import Link from "next/link";
import { ArrowRight, Database, IndianRupee, Percent, Receipt, Sparkles, Wallet } from "lucide-react";

import { prisma } from "@/lib/db";
import { getDemoMerchant } from "@/lib/demo-merchant";
import { detectAbandonedCheckoutOpportunity, formatInr } from "@/lib/services/opportunity-engine";
import { MetricTile } from "@/components/dashboard/metric-tile";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";

export default async function OverviewPage() {
  const [merchant, orderCount, paidOrders, paidAggregate] = await Promise.all([
    getDemoMerchant(),
    prisma.order.count(),
    prisma.order.count({ where: { status: "PAID" } }),
    prisma.order.aggregate({ where: { status: "PAID" }, _sum: { amount: true } }),
  ]);

  const opportunity = merchant
    ? await detectAbandonedCheckoutOpportunity(merchant.id)
    : { detected: false as const };

  const hasData = orderCount > 0;
  const gmv = paidAggregate._sum.amount ?? 0;
  const aov = paidOrders > 0 ? gmv / paidOrders : 0;
  const conversion = orderCount > 0 ? (paidOrders / orderCount) * 100 : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Overview
          </h1>
          <p className="text-sm text-muted-foreground">
            Demo merchant · Razorpay test mode
          </p>
        </div>
        <StatusBadge variant={hasData ? "success" : "info"}>
          {hasData ? "Live data" : "Awaiting seed data"}
        </StatusBadge>
      </div>

      {hasData ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricTile
            label="GMV"
            value={formatInr(gmv)}
            icon={IndianRupee}
            hint="Captured, test mode"
          />
          <MetricTile label="Orders" value={String(orderCount)} icon={Receipt} />
          <MetricTile label="AOV" value={formatInr(aov)} icon={Wallet} />
          <MetricTile
            label="Conversion"
            value={`${conversion.toFixed(1)}%`}
            icon={Percent}
          />
        </div>
      ) : (
        <EmptyState
          icon={Database}
          title="No orders yet"
          description="Run the seed script (Phase 6) or connect Razorpay test keys in Settings to populate GMV, orders, AOV, and conversion here."
        />
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">AI opportunities</h2>
        {opportunity.detected ? (
          <Link
            href="/opportunities"
            className="glow-ai group flex flex-col gap-3 rounded-2xl border border-ai/20 bg-gradient-to-b from-ai/[0.06] to-transparent p-5 transition-colors hover:from-ai/[0.1] sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ai/10 text-ai">
                <Sparkles className="size-4" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {opportunity.totalAbandonedCount} abandoned checkouts ·{" "}
                  {formatInr(opportunity.totalAbandonedValue)} stalled
                </p>
                <p className="text-xs text-muted-foreground">
                  {opportunity.highIntentCount} high-intent · est. recovery{" "}
                  {formatInr(opportunity.impactMin)}–{formatInr(opportunity.impactMax)}
                </p>
              </div>
            </div>
            <span className="flex items-center gap-1 text-xs font-medium text-ai">
              Review opportunity
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ) : (
          <EmptyState
            tone="ai"
            icon={Sparkles}
            title="No opportunities yet"
            description="No abandoned checkouts found in your order history right now — once there's order history to analyze, detected opportunities will appear here for review."
          />
        )}
      </section>
    </div>
  );
}
