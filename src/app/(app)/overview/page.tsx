import { Database, IndianRupee, Percent, Receipt, Sparkles, Wallet } from "lucide-react";

import { prisma } from "@/lib/db";
import { MetricTile } from "@/components/dashboard/metric-tile";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";

export default async function OverviewPage() {
  const [orderCount, paidOrders, paidAggregate] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { status: "PAID" } }),
    prisma.order.aggregate({ where: { status: "PAID" }, _sum: { amount: true } }),
  ]);

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
        <EmptyState
          tone="ai"
          icon={Sparkles}
          title="No opportunities yet"
          description="The opportunity engine ships in Phase 7 — once there's order history to analyze, detected opportunities will appear here for review."
        />
      </section>
    </div>
  );
}

function formatInr(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}
