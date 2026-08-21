import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Database,
  IndianRupee,
  Layers,
  Percent,
  Receipt,
  Repeat,
  ShieldOff,
  Sparkles,
  Wallet,
} from "lucide-react";

import { prisma } from "@/backend/lib/db";
import { getDemoMerchant } from "@/backend/lib/demo-merchant";
import { auditActionLabel } from "@/backend/lib/audit-labels";
import { getAnalyticsSnapshot } from "@/backend/lib/services/analytics";
import { detectAbandonedCheckoutOpportunity, formatInr } from "@/backend/lib/services/opportunity-engine";
import { MetricTile } from "@/frontend/components/dashboard/metric-tile";
import { Section } from "@/frontend/components/dashboard/section";
import { RazorpayPanel } from "@/frontend/components/dashboard/razorpay-panel";
import { RecoveryFunnel } from "@/frontend/components/dashboard/recovery-funnel";
import { ActivityFeed } from "@/frontend/components/dashboard/activity-feed";
import { EmptyState } from "@/frontend/components/empty-state";
import { StatusBadge } from "@/frontend/components/status-badge";

// Dashboard numbers and opportunity detection must be recomputed on every
// request, not cached as static HTML at build time.
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const gatewayMode = process.env.RAZORPAY_KEY_ID ? "real" : "simulated";
  const webhookConfigured = Boolean(process.env.RAZORPAY_WEBHOOK_SECRET);

  const merchant = await getDemoMerchant();

  if (!merchant) {
    return (
      <div className="space-y-8">
        <Header gatewayMode={gatewayMode} hasData={false} />
        <EmptyState
          icon={Database}
          title="No merchant found"
          description="Run the seed script (npm run db:seed) to create the demo merchant and its order history."
        />
      </div>
    );
  }

  const [snapshot, opportunity, crossSell, recentLogs, linkStats, paidTargets] = await Promise.all([
    getAnalyticsSnapshot(merchant.id),
    detectAbandonedCheckoutOpportunity(merchant.id),
    prisma.opportunity.findFirst({
      where: { merchantId: merchant.id, type: "CROSS_SELL", status: "OPEN" },
    }),
    prisma.auditLog.findMany({
      where: { merchantId: merchant.id },
      orderBy: { timestamp: "desc" },
      take: 6,
    }),
    prisma.campaignTarget.count({
      where: { campaign: { merchantId: merchant.id }, status: { in: ["LINK_CREATED", "PAID"] } },
    }),
    prisma.campaignTarget.aggregate({
      where: { campaign: { merchantId: merchant.id }, status: "PAID" },
      _count: { id: true },
      _sum: { amount: true },
    }),
  ]);

  const { merchant: m, ai, financialSafety, businessImpact } = snapshot;
  const hasData = m.totalOrders > 0;

  if (!hasData) {
    return (
      <div className="space-y-8">
        <Header gatewayMode={gatewayMode} hasData={false} />
        <EmptyState
          icon={Database}
          title="No orders yet"
          description="Run the seed script (npm run db:seed) to populate order history, then detection and analytics fill in automatically."
        />
      </div>
    );
  }

  const highIntentValue = opportunity.detected ? opportunity.highIntentValue : 0;
  const highIntentCount = opportunity.detected ? opportunity.highIntentCount : 0;
  const abandonedCount = opportunity.detected ? opportunity.totalAbandonedCount : 0;
  const abandonedValue = opportunity.detected ? opportunity.totalAbandonedValue : 0;

  return (
    <div className="space-y-9">
      <Header gatewayMode={gatewayMode} hasData />

      <Section title="Store performance" note="Real totals from your order history">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <MetricTile label="GMV" value={formatInr(m.gmv)} icon={IndianRupee} hint="Captured payments only" />
          <MetricTile label="Orders" value={String(m.totalOrders)} icon={Receipt} hint="All states, paid and not" />
          <MetricTile label="AOV" value={formatInr(m.aov)} icon={Wallet} hint="Average value per paid order" />
          <MetricTile
            label="Conversion"
            value={`${m.conversionPercent.toFixed(1)}%`}
            icon={Percent}
            hint="Paid orders ÷ all orders"
          />
          <MetricTile
            label="Repeat buyers"
            value={String(m.repeatCustomers)}
            icon={Repeat}
            hint="Customers with 2+ paid orders"
          />
        </div>
      </Section>

      <Section
        title="Razorpay execution"
        note="Live status of the payments integration"
      >
        <RazorpayPanel
          data={{
            mode: gatewayMode,
            webhookConfigured,
            linksCreated: linkStats,
            linksPaid: paidTargets._count.id,
            amountCollected: paidTargets._sum.amount ?? 0,
          }}
        />
      </Section>

      <Section
        title="Recovery funnel"
        note="First two are live now, last two all-time"
        action={
          <Link
            href="/campaigns"
            className="flex items-center gap-1 text-xs font-medium text-ai hover:underline"
          >
            Open campaigns
            <ArrowRight className="size-3.5" />
          </Link>
        }
      >
        <RecoveryFunnel
          stages={[
            {
              label: "Abandoned",
              count: abandonedCount,
              value: abandonedValue,
              note: "Checkouts started, never paid",
            },
            {
              label: "Worth targeting",
              count: highIntentCount,
              value: highIntentValue,
              note: "Scored high-intent by the engine",
            },
            {
              label: "Links sent",
              count: linkStats,
              value: businessImpact.campaignCost,
              note: "All-time, after your approval",
            },
            {
              label: "Recovered",
              count: paidTargets._count.id,
              value: paidTargets._sum.amount ?? 0,
              note: "All-time, webhook-confirmed",
            },
          ]}
        />
      </Section>

      <Section
        title="Opportunities waiting on you"
        note="Detected by rules, explained by AI"
        action={
          <Link
            href="/opportunities"
            className="flex items-center gap-1 text-xs font-medium text-ai hover:underline"
          >
            Review all
            <ArrowRight className="size-3.5" />
          </Link>
        }
      >
        <div className="grid gap-3 lg:grid-cols-2">
          {opportunity.detected ? (
            <OpportunityLink
              title={`${opportunity.totalAbandonedCount} abandoned checkouts · ${formatInr(opportunity.totalAbandonedValue)} stalled`}
              subtitle={`${opportunity.highIntentCount} high-intent · est. recovery ${formatInr(opportunity.impactMin)}–${formatInr(opportunity.impactMax)}`}
              note="Send a discounted Razorpay link"
            />
          ) : (
            <EmptyState
              tone="ai"
              icon={Sparkles}
              title="No abandoned-checkout signal"
              description="Nothing recoverable found in the current order history."
            />
          )}

          {crossSell ? (
            <OpportunityLink
              title={crossSell.title}
              subtitle={`Est. uplift ${formatInr(crossSell.impactMin)}–${formatInr(crossSell.impactMax)}`}
              note="Pair two products that sell together"
            />
          ) : (
            <EmptyState
              tone="ai"
              icon={Layers}
              title="No cross-sell pair yet"
              description="Basket analysis found no pair above the lift threshold right now."
            />
          )}
        </div>
      </Section>

      <div className="grid gap-9 lg:grid-cols-2">
        <Section title="Safety record" note="What the guardrails stopped or allowed">
          <div className="grid grid-cols-2 gap-4">
            <MetricTile
              label="Money actions"
              value={String(financialSafety.totalMoneyActions)}
              icon={IndianRupee}
              hint="Every attempt to move money"
            />
            <MetricTile
              label="You approved"
              value={String(ai.recommendationsAccepted)}
              icon={BadgeCheck}
              hint="Nothing runs without this"
            />
            <MetricTile
              label="Blocked by policy"
              value={String(financialSafety.blockedActions)}
              icon={ShieldOff}
              hint="Over budget or discount cap"
            />
            <MetricTile
              label="Duplicates prevented"
              value={String(financialSafety.duplicatePreventionEvents)}
              icon={Repeat}
              hint="Retries that never double-charged"
            />
          </div>
        </Section>

        <Section
          title="Recent activity"
          note="Newest entries from the audit trail"
          action={
            <Link
              href="/audit"
              className="flex items-center gap-1 text-xs font-medium text-ai hover:underline"
            >
              Full trail
              <ArrowRight className="size-3.5" />
            </Link>
          }
        >
          <ActivityFeed
            items={recentLogs.map((log) => ({
              id: log.id,
              actor: log.actor,
              label: auditActionLabel(log.action),
              status: log.status,
              timestamp: log.timestamp,
            }))}
          />
        </Section>
      </div>
    </div>
  );
}

function Header({
  gatewayMode,
  hasData,
}: {
  gatewayMode: "real" | "simulated";
  hasData: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Your store, the revenue it is leaking, and what the agent proposes to do about it.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge variant={hasData ? "success" : "info"} pulse={hasData}>
          {hasData ? "Live data" : "Awaiting seed data"}
        </StatusBadge>
        <StatusBadge variant={gatewayMode === "real" ? "success" : "pending"}>
          {gatewayMode === "real" ? "Razorpay test mode" : "Simulated gateway"}
        </StatusBadge>
      </div>
    </div>
  );
}

function OpportunityLink({
  title,
  subtitle,
  note,
}: {
  title: string;
  subtitle: string;
  note: string;
}) {
  return (
    <Link
      href="/opportunities"
      className="group flex flex-col gap-2 rounded-2xl border border-ai/25 bg-gradient-to-b from-ai/[0.07] to-transparent p-5 transition-colors hover:from-ai/[0.12]"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ai/10 text-ai">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <ArrowRight className="size-4 shrink-0 text-ai transition-transform group-hover:translate-x-0.5" />
      </div>
      <p className="text-[11px] text-muted-foreground">{note}</p>
    </Link>
  );
}
