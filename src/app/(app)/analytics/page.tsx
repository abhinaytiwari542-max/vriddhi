import {
  BadgeCheck,
  BarChart3,
  Bot,
  Ear,
  IndianRupee,
  Percent,
  Receipt,
  Repeat,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  TrendingUp,
  Wallet,
  Wrench,
} from "lucide-react";

import { getDemoMerchant } from "@/lib/demo-merchant";
import { getAnalyticsSnapshot } from "@/lib/services/analytics";
import { formatInr } from "@/lib/format";
import { MetricTile } from "@/components/dashboard/metric-tile";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function pct(value: number) {
  return `${value.toFixed(1)}%`;
}

function notMeasuredReason(metric: { measured: boolean; reason?: string }) {
  return metric.measured ? "" : (metric.reason ?? "");
}

function NotMeasuredTile({
  label,
  icon: Icon,
  reason,
}: {
  label: string;
  icon: React.ComponentProps<typeof MetricTile>["icon"];
  reason: string;
}) {
  return (
    <Card className="gap-2 p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <span className="text-lg font-semibold tracking-tight text-muted-foreground">
        Not yet measured
      </span>
      <span className="text-xs text-muted-foreground">{reason}</span>
    </Card>
  );
}

export default async function AnalyticsPage() {
  const merchant = await getDemoMerchant();
  const snapshot = merchant ? await getAnalyticsSnapshot(merchant.id) : null;

  if (!merchant || !snapshot) {
    return (
      <div className="space-y-8">
        <PageHeader />
        <EmptyState
          icon={BarChart3}
          title="No merchant found"
          description="Seed the database (Phase 6) to see analytics here."
        />
      </div>
    );
  }

  const { merchant: m, ai, financialSafety, businessImpact } = snapshot;
  const hasOrders = m.totalOrders > 0;

  return (
    <div className="space-y-10">
      <PageHeader />

      {!hasOrders ? (
        <EmptyState
          icon={BarChart3}
          title="No orders yet"
          description="Run the seed script (Phase 6) to populate merchant, AI, and financial-safety analytics."
        />
      ) : (
        <>
          <Section title="Merchant" description="Real revenue and order metrics — from the Order/Payment tables directly.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <MetricTile label="GMV" value={formatInr(m.gmv)} icon={IndianRupee} hint="Captured, test mode" />
              <MetricTile label="Total orders" value={String(m.totalOrders)} icon={Receipt} />
              <MetricTile label="AOV" value={formatInr(m.aov)} icon={Wallet} />
              <MetricTile label="Conversion" value={pct(m.conversionPercent)} icon={Percent} hint="Paid ÷ total orders" />
              <MetricTile label="Repeat customers" value={String(m.repeatCustomers)} icon={Repeat} hint="More than one paid order" />
            </div>
          </Section>

          <Section
            title="AI agent"
            description="How the growth agent's own recommendations performed — opportunity detection through to execution."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <MetricTile label="Opportunities detected" value={String(ai.opportunitiesDetected)} icon={Sparkles} />
              <MetricTile
                label="Recommendations accepted"
                value={String(ai.recommendationsAccepted)}
                icon={BadgeCheck}
                hint={`${ai.recommendationsRejected} rejected`}
              />
              <MetricTile label="Actions executed" value={String(ai.actionsExecuted)} icon={Bot} hint="Campaigns that ran through Razorpay" />
              {ai.executionSuccessRate.measured ? (
                <MetricTile
                  label="Execution success rate"
                  value={pct(ai.executionSuccessRate.value)}
                  icon={TrendingUp}
                  hint="Completed ÷ executed campaigns"
                />
              ) : (
                <NotMeasuredTile label="Execution success rate" icon={TrendingUp} reason={ai.executionSuccessRate.reason} />
              )}
              {ai.agentInterventionRate.measured ? (
                <MetricTile
                  label="Agent intervention rate"
                  value={pct(ai.agentInterventionRate.value)}
                  icon={Wrench}
                  hint="Merchant modified vs approved as-is"
                />
              ) : (
                <NotMeasuredTile label="Agent intervention rate" icon={Wrench} reason={ai.agentInterventionRate.reason} />
              )}
            </div>
          </Section>

          <Section
            title="Financial safety"
            description="Every attempt to move money, and what the guardrails did with it — read straight off the audit trail."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <MetricTile
                label="Total money actions"
                value={String(financialSafety.totalMoneyActions)}
                icon={IndianRupee}
                hint="Payment links + buyer purchase proposals"
              />
              <MetricTile
                label="Approved"
                value={String(financialSafety.approvedActions)}
                icon={ShieldCheck}
              />
              <MetricTile
                label="Blocked by policy"
                value={String(financialSafety.blockedActions)}
                icon={ShieldOff}
              />
              <MetricTile
                label="Failed (no charge)"
                value={String(financialSafety.failedActions)}
                icon={ShieldAlert}
              />
              <MetricTile
                label="Duplicate prevention events"
                value={String(financialSafety.duplicatePreventionEvents)}
                icon={Ear}
                hint="Retries and re-authorizations refused"
              />
            </div>
          </Section>

          <Section
            title="Business impact"
            description="What the recovered revenue is actually worth — labeled honestly where the underlying customer action hasn't happened yet in this test environment."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <MetricTile
                label="Campaign cost committed"
                value={formatInr(businessImpact.campaignCost)}
                icon={Wallet}
                hint="Discount value on created payment links"
              />
              <NotMeasuredTile
                label="Incremental GMV"
                icon={TrendingUp}
                reason={notMeasuredReason(businessImpact.incrementalGmv)}
              />
              <NotMeasuredTile
                label="Recovery rate"
                icon={Percent}
                reason={notMeasuredReason(businessImpact.recoveryRate)}
              />
              <NotMeasuredTile label="ROI" icon={BarChart3} reason={notMeasuredReason(businessImpact.roi)} />
            </div>
            {businessImpact.designedRecoveryEstimate && (
              <p className="text-xs text-muted-foreground">
                Designed estimate (not measured): the open abandoned-checkout opportunity projects{" "}
                {formatInr(businessImpact.designedRecoveryEstimate.impactMin)}–
                {formatInr(businessImpact.designedRecoveryEstimate.impactMax)} in recoverable revenue, based on an
                assumed 15–25% recovery rate — see Opportunities for the full reasoning.
              </p>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function PageHeader() {
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-foreground">Analytics</h1>
      <p className="text-sm text-muted-foreground">
        Real numbers pulled from the database — nothing here is projected or simulated unless labeled as such.
      </p>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}
